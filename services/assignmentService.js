const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');
const excelService = require('./excelService');
const configService = require('./configService');
const ExcelJS = require('exceljs');

const ASSIGNMENTS_FILE = storagePath.getDataFilePath('assignments.json');

class AssignmentService {
  constructor() {
    this.ensureDataFile();
  }

  ensureDataFile() {
    try {
      storagePath.ensureDataDirectory();
      if (!fs.existsSync(ASSIGNMENTS_FILE)) {
        const initialData = {
          assignments: {},
          history: []
        };
        fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(initialData, null, 2), 'utf8');
      }
    } catch (err) {
      console.warn('Notice ensuring assignments file:', err.message);
    }
  }

  loadData() {
    this.ensureDataFile();
    try {
      if (fs.existsSync(ASSIGNMENTS_FILE)) {
        const raw = fs.readFileSync(ASSIGNMENTS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (!parsed.assignments && !parsed.history) {
            return {
              assignments: parsed,
              history: []
            };
          }
          return {
            assignments: parsed.assignments || {},
            history: Array.isArray(parsed.history) ? parsed.history : []
          };
        }
      }
    } catch (err) {
      console.warn('Error reading assignments data:', err.message);
    }
    return {
      assignments: {},
      history: []
    };
  }

  saveData(data) {
    try {
      storagePath.ensureDataDirectory();
      const dir = path.dirname(ASSIGNMENTS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving assignments:', err.message);
    }
  }

  /**
   * Get active assignment details for a specific Centro and inventory type
   */
  getAssignment(centro, inventoryType = 'ciclico') {
    const c = String(centro || '1300');
    const t = String(inventoryType || 'ciclico').toLowerCase().trim();
    const key = `${c}_${t}`;
    const data = this.loadData();

    if (data.assignments && data.assignments[key]) {
      return data.assignments[key];
    }
    // Fallback for default ciclico
    if (t === 'ciclico' && data.assignments && data.assignments[c]) {
      return data.assignments[c];
    }

    const prefixMap = { ciclico: 'CYC', semanal: 'SEM', mensual: 'MEN', barrido: 'BAR' };
    const prefix = prefixMap[t] || 'CYC';

    return {
      centro: c,
      inventoryType: t,
      cycleId: `${prefix}-${c}-001`,
      status: 'NO_ASIGNADO', // NO_ASIGNADO | ASIGNADO | CONCLUIDO
      assignedToUserId: null,
      assignedToUserName: null,
      assignedToUserLogin: null,
      assignedByUserName: null,
      assignedAt: null,
      completedAt: null,
      signatureStamp: null,
      notes: ''
    };
  }

  /**
   * Get all active assignments across all centros
   */
  getAllAssignments() {
    const data = this.loadData();
    return data.assignments || {};
  }

  /**
   * Encargado assigns a cyclic count to a specific Auxiliar (scoped to their own centro)
   */
  assignCycle(centro, { assignedToUserId, assignedToUserName, assignedToUserLogin, assignedByUserName, assignedByUserRole, assignedByUserCentro, notes = '', inventoryType = 'ciclico' }) {
    const c = String(centro || '1300');
    const t = String(inventoryType || 'ciclico').toLowerCase().trim();
    const key = `${c}_${t}`;

    // Validation: If assigner is Encargado, they can ONLY assign to their own Centro
    if (String(assignedByUserRole || '').toUpperCase() === 'ENCARGADO') {
      const uCentro = String(assignedByUserCentro || '').trim();
      if (uCentro && uCentro !== 'TODOS' && uCentro !== c) {
        throw new Error(`Acceso denegado: Como Encargado del Centro ${uCentro}, solo puedes asignar inventarios en tu propio Centro.`);
      }
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const data = this.loadData();
    const currentActive = data.assignments[key] || (t === 'ciclico' ? data.assignments[c] : null);

    // Reasignación in-place si ya existe una orden activa ASIGNADO en este centro (evita duplicados en historial)
    if (currentActive && currentActive.status === 'ASIGNADO' && currentActive.cycleId) {
      currentActive.assignedToUserId = assignedToUserId;
      currentActive.assignedToUserName = String(assignedToUserName || '').trim();
      currentActive.assignedToUserLogin = String(assignedToUserLogin || '').trim();
      currentActive.assignedByUserName = String(assignedByUserName || 'Encargado de Centro').trim();
      currentActive.assignedAt = now;
      currentActive.notes = notes;
      currentActive.inventoryType = t;

      const histIdx = data.history.findIndex(h => h.cycleId === currentActive.cycleId);
      if (histIdx !== -1) {
        data.history[histIdx].assignedToUserId = assignedToUserId;
        data.history[histIdx].assignedToUserName = currentActive.assignedToUserName;
        data.history[histIdx].assignedToUserLogin = currentActive.assignedToUserLogin;
        data.history[histIdx].assignedByUserName = currentActive.assignedByUserName;
        data.history[histIdx].assignedAt = now;
        data.history[histIdx].notes = notes;
        data.history[histIdx].inventoryType = t;
      } else {
        data.history.unshift({
          ...currentActive,
          inventoryType: t,
          summary: {
            totalItems: 0,
            countedItems: 0,
            pendingItems: 0,
            exactMatches: 0,
            missingItems: 0,
            surplusItems: 0,
            discrepancies: 0,
            iraPercentage: 100.0,
            netVarianceCost: 0,
            absoluteVarianceCost: 0
          }
        });
      }

      data.assignments[key] = currentActive;
      if (t === 'ciclico') data.assignments[c] = currentActive;

      this.saveData(data);
      return currentActive;
    }

    // Creación de una nueva orden de asignación
    const prefixMap = { ciclico: 'CYC', semanal: 'SEM', mensual: 'MEN', barrido: 'BAR' };
    const prefix = prefixMap[t] || 'CYC';
    const cycleId = `${prefix}-${c}-${Date.now().toString().slice(-4)}`;

    const assignment = {
      centro: c,
      inventoryType: t,
      cycleId,
      status: 'ASIGNADO',
      assignedToUserId,
      assignedToUserName: String(assignedToUserName || '').trim(),
      assignedToUserLogin: String(assignedToUserLogin || '').trim(),
      assignedByUserName: String(assignedByUserName || 'Encargado de Centro').trim(),
      assignedAt: now,
      completedAt: null,
      completedBy: null,
      signatureStamp: null,
      notes
    };

    data.assignments[key] = assignment;
    if (t === 'ciclico') data.assignments[c] = assignment;

    const historyEntry = {
      ...assignment,
      summary: {
        totalItems: 0,
        countedItems: 0,
        pendingItems: 0,
        exactMatches: 0,
        missingItems: 0,
        surplusItems: 0,
        discrepancies: 0,
        iraPercentage: 100.0,
        netVarianceCost: 0,
        absoluteVarianceCost: 0
      }
    };

    // Prepend to history so newest appears first
    data.history.unshift(historyEntry);

    this.saveData(data);
    return assignment;
  }

  /**
   * Check if a given user is authorized to view and count this Centro's cycle
   * - ADMIN (ABSAEL, JCARLOS, ALONSO): Full global access
   * - ENCARGADO: Scoped ONLY to their own centro
   * - AUXILIAR: Scoped ONLY to their own centro and active assignment
   */
  checkPermission(centro, user) {
    if (!user) {
      return { allowed: false, reason: 'No autenticado' };
    }

    const c = String(centro || '1300');
    const assignment = this.getAssignment(c);
    const userRole = String(user.cargo || '').toUpperCase();
    const userCentro = String(user.centro || '').trim();

    // 1. Global Administrators have unrestricted access
    if (userRole === 'ADMIN') {
      return {
        allowed: true,
        role: 'ADMIN',
        assignment
      };
    }

    // 2. Encargados: Strictly scoped to their own centro
    if (userRole === 'ENCARGADO') {
      if (userCentro && userCentro !== 'TODOS' && userCentro !== c) {
        return {
          allowed: false,
          role: 'ENCARGADO',
          assignment,
          reason: `Acceso restringido: Como Encargado del Centro ${userCentro}, solo puedes ver y gestionar las órdenes de tu propio centro.`
        };
      }
      return {
        allowed: true,
        role: 'ENCARGADO',
        assignment
      };
    }

    // 3. Auxiliares: Strictly scoped to their own centro
    if (userCentro && userCentro !== 'TODOS' && userCentro !== c) {
      return {
        allowed: false,
        role: 'AUXILIAR',
        assignment,
        reason: `Acceso restringido: Perteneces al Centro ${userCentro} y no tienes autorización para acceder al Centro ${c}.`
      };
    }

    // Auxiliar matching: by ID, login (usuario), or full name (nombre)
    const targetUserId = String(user.id || '').trim();
    const targetLogin = String(user.usuario || user.userLogin || '').trim().toUpperCase();
    const targetName = String(user.nombre || user.userName || '').trim().toUpperCase();

    const assignedUserId = String(assignment.assignedToUserId || '').trim();
    const assignedLogin = String(assignment.assignedToUserLogin || '').trim().toUpperCase();
    const assignedName = String(assignment.assignedToUserName || '').trim().toUpperCase();

    const isAssigned = (
      (targetUserId && assignedUserId && targetUserId === assignedUserId) ||
      (targetLogin && assignedLogin && (targetLogin === assignedLogin || assignedLogin.includes(targetLogin))) ||
      (targetName && assignedName && (targetName === assignedName || assignedName.includes(targetName) || targetName.includes(assignedName)))
    );

    if (assignment.status === 'ASIGNADO' && isAssigned) {
      return {
        allowed: true,
        role: 'AUXILIAR',
        assignment
      };
    }

    if (assignment.status === 'CONCLUIDO' && isAssigned) {
      return {
        allowed: true,
        role: 'AUXILIAR',
        assignment,
        concluded: true
      };
    }

    if (assignment.status === 'NO_ASIGNADO') {
      return {
        allowed: false,
        role: 'AUXILIAR',
        assignment,
        reason: `No hay ningún inventario cíclico asignado para el Centro ${c}. El Encargado debe asignar la orden de conteo.`
      };
    }

    return {
      allowed: false,
      role: 'AUXILIAR',
      assignment,
      reason: `El inventario cíclico actual del Centro ${c} está asignado a ${assignment.assignedToUserName || 'otro auxiliar'}.`
    };
  }

  /**
   * Check if an Auxiliar user has an active pending assignment in the specified Centro (or any centro)
   */
  getUserActiveAssignment(centro, user) {
    if (!user) return null;
    const c = String(centro || user.centro || '1300');
    const perm = this.checkPermission(c, user);
    if (perm.allowed && (perm.role === 'AUXILIAR' || perm.role === 'ADMIN') && !perm.concluded && perm.assignment && perm.assignment.status === 'ASIGNADO') {
      return perm.assignment;
    }
    return null;
  }

  /**
   * Get list of historical cyclic counts with filter/search support and role scoping
   */
  getHistory({ centro, status, search, requestingUser, inventoryType } = {}) {
    const data = this.loadData();
    let list = Array.isArray(data.history) ? [...data.history] : [];

    let targetCentro = centro ? String(centro).trim() : null;

    // Encargados & Auxiliares: Strictly scoped to their own centro
    if (requestingUser) {
      const role = String(requestingUser.cargo || '').toUpperCase();
      const uCentro = String(requestingUser.centro || '').trim();
      if ((role === 'ENCARGADO' || role === 'AUXILIAR') && uCentro && uCentro !== 'TODOS') {
        targetCentro = uCentro;
      }
    }

    if (targetCentro && targetCentro !== 'TODOS') {
      list = list.filter(item => String(item.centro).trim() === targetCentro);
    }

    if (inventoryType && inventoryType !== 'TODOS') {
      const t = String(inventoryType).toLowerCase().trim();
      list = list.filter(item => String(item.inventoryType || 'ciclico').toLowerCase() === t);
    }

    if (status) {
      const s = String(status).trim().toUpperCase();
      if (s === 'CONCLUIDO') {
        list = list.filter(item => item.status === 'CONCLUIDO');
      } else if (s === 'ASIGNADO' || s === 'EN_PROCESO') {
        list = list.filter(item => item.status === 'ASIGNADO');
      }
    }

    if (search) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(item =>
        (item.cycleId && item.cycleId.toLowerCase().includes(q)) ||
        (item.centro && item.centro.toLowerCase().includes(q)) ||
        (item.assignedToUserName && item.assignedToUserName.toLowerCase().includes(q)) ||
        (item.assignedToUserLogin && item.assignedToUserLogin.toLowerCase().includes(q)) ||
        (item.assignedByUserName && item.assignedByUserName.toLowerCase().includes(q)) ||
        (item.completedBy && item.completedBy.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    }

    return list;
  }

  /**
   * Conclude and digitally sign cyclic count in Excel & Google Sheets
   */
  async concludeAndSignCycle(centro, { signatureBase64, operatorName, operatorRole, notes = '', summary = null, inventoryType = 'ciclico' }) {
    const c = String(centro || '1300');
    const t = String(inventoryType || 'ciclico').toLowerCase().trim();
    const key = `${c}_${t}`;
    const assignment = this.getAssignment(c, t);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const config = configService.getConfig();
    const filePath = configService.getExcelPathForType(t);
    const targetUrl = configService.getUrlForType(t);

    // 1. Try to record digital signature and audit in Excel if file exists
    if (fs.existsSync(filePath)) {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const worksheet = excelService.resolveWorksheet(workbook, c);
        if (worksheet) {
          if (signatureBase64 && signatureBase64.includes('base64,')) {
            const cleanBase64 = signatureBase64.split('base64,')[1];
            const imageId = workbook.addImage({
              base64: cleanBase64,
              extension: 'png'
            });

            const lastRow = Math.max(worksheet.rowCount + 2, 25);
            const signLabelRow = worksheet.getRow(lastRow);
            signLabelRow.getCell('A').value = `FIRMA DIGITAL DE CONFORMIDAD - INVENTARIO CONCLUIDO (${t.toUpperCase()})`;
            signLabelRow.getCell('A').font = { bold: true, color: { argb: 'FF1E293B' }, size: 11 };

            const detailsRow = worksheet.getRow(lastRow + 1);
            detailsRow.getCell('A').value = `Firmado por: ${operatorName} (${operatorRole || 'Operador'}) | Fecha: ${now} | Tipo: ${t.toUpperCase()} | Estado: CONCLUIDO Y AUDITADO`;
            detailsRow.getCell('A').font = { italic: true, color: { argb: 'FF475569' }, size: 9 };

            worksheet.addImage(imageId, {
              tl: { col: 0, row: lastRow + 2 },
              ext: { width: 260, height: 90 }
            });
          }

          const cleanC = String(c || '1300').replace(/^Centro\s*/i, '').trim();
          let auditSheet = workbook.getWorksheet(`Auditoria_${cleanC}`) || workbook.getWorksheet('Auditoria_Conteos');
          if (auditSheet) {
            const prefixMap = { ciclico: 'CIERRE', semanal: 'CIERRE_SEM', mensual: 'CIERRE_MEN', barrido: 'CIERRE_BAR' };
            const prefix = prefixMap[t] || 'CIERRE';
            const closureId = `${prefix}-${c}-${Date.now().toString().slice(-4)}`;
            auditSheet.addRow([
              closureId,
              c,
              now,
              'TODO_EL_CICLO',
              `CIERRE Y FIRMA DIGITAL DE INVENTARIO (${t.toUpperCase()})`,
              'CENTRO COMPLETO',
              0,
              0,
              0,
              0,
              'CONCLUIDO_Y_FIRMADO',
              operatorName,
              `Firma digital registrada exitosamente. ${notes}`
            ]);
          }

          await excelService.safeWriteFile(workbook, filePath);
        }
      } catch (excelErr) {
        console.warn('Aviso guardando firma en Excel local:', excelErr.message);
      }
    }

    // 2. Fetch current analytics summary for conclusion record
    let cycleSummary = summary;
    if (!cycleSummary) {
      try {
        if (targetUrl && config.syncMode === 'google_sheets') {
          const googleSheetService = require('./googleSheetService');
          cycleSummary = await googleSheetService.getAnalytics(targetUrl, c);
        } else {
          cycleSummary = await excelService.getAnalytics(filePath, config.activeSheetName, config.columnMapping, c);
        }
      } catch (sumErr) {
        console.warn('Aviso calculando resumen de conclusión:', sumErr.message);
        cycleSummary = {
          totalItems: 0,
          countedItems: 0,
          exactMatches: 0,
          missingItems: 0,
          surplusItems: 0,
          discrepancies: 0,
          iraPercentage: 100.0,
          netVarianceCost: 0,
          absoluteVarianceCost: 0
        };
      }
    }

    // 3. Export standalone Google Sheet into Google Drive folder "Nibol/ciclicos"
    let driveExportResult = null;
    if (targetUrl && config.syncMode === 'google_sheets') {
      try {
        const googleSheetService = require('./googleSheetService');
        driveExportResult = await googleSheetService.concludeCycle(targetUrl, {
          centro: c,
          signatureBase64,
          operatorName,
          operatorRole,
          notes,
          totalCounted: cycleSummary?.countedItems || 0,
          iraPercent: cycleSummary?.iraPercentage || 100
        });
      } catch (driveErr) {
        console.warn('Aviso exportando a Google Drive Nibol/ciclicos:', driveErr.message);
      }
    }

    // 4. Update assignment state & history in assignments.json
    assignment.status = 'CONCLUIDO';
    assignment.completedAt = now;
    assignment.completedBy = operatorName;
    assignment.signatureStamp = {
      signedBy: operatorName,
      signedAt: now,
      role: operatorRole || 'Operador',
      signaturePresent: !!signatureBase64,
      signatureBase64: signatureBase64 || null
    };
    assignment.summary = {
      totalItems: cycleSummary?.totalItems || 0,
      countedItems: cycleSummary?.countedItems || 0,
      pendingItems: cycleSummary?.pendingItems || 0,
      exactMatches: cycleSummary?.exactMatches || 0,
      missingItems: cycleSummary?.missingItems || 0,
      surplusItems: cycleSummary?.surplusItems || 0,
      discrepancies: (cycleSummary?.missingItems || 0) + (cycleSummary?.surplusItems || 0),
      iraPercentage: cycleSummary?.iraPercentage || 100.0,
      netVarianceCost: cycleSummary?.netVarianceCost || 0,
      absoluteVarianceCost: cycleSummary?.absoluteVarianceCost || 0
    };
    
    const dateStr = now.substring(0, 10);
    if (driveExportResult && driveExportResult.fileUrl) {
      assignment.googleDriveFileUrl = driveExportResult.fileUrl;
      assignment.googleDriveFolderUrl = driveExportResult.folderUrl;
      assignment.documentFileName = driveExportResult.fileName;
    } else {
      assignment.documentFileName = `${dateStr}_Ciclico_Centro_${c}.xlsx`;
      assignment.googleDriveFolderUrl = 'https://drive.google.com/drive/folders/1eYg5xYTpWVhgBk_vLDJH3_ZxAMxGc-wY?usp=sharing';
    }
    assignment.notes = notes || assignment.notes;

    const data = this.loadData();

    // Update history record
    let historyIdx = data.history.findIndex(h => h.cycleId === assignment.cycleId);
    if (historyIdx !== -1) {
      data.history[historyIdx] = { ...assignment };
    } else {
      data.history.unshift({ ...assignment });
    }

    // 5. Reset & clean the counting sheet for Centro in Excel & Google Sheets
    try {
      if (fs.existsSync(filePath)) {
        await excelService.resetCycle(filePath, config.activeSheetName, config.columnMapping, {}, c);
      }
      if (targetUrl && config.syncMode === 'google_sheets') {
        const googleSheetService = require('./googleSheetService');
        await googleSheetService.resetCycle(targetUrl, c, {});
      }
    } catch (resetErr) {
      console.warn('Aviso limpiando conteo tras conclusión:', resetErr.message);
    }

    // 5. Reset active assignment in this centro and type to NO_ASIGNADO (ready for new cycle)
    const concludedCycleSnapshot = { ...assignment };
    const prefixMap = { ciclico: 'CYC', semanal: 'SEM', mensual: 'MEN', barrido: 'BAR' };
    const prefix = prefixMap[t] || 'CYC';

    data.assignments[key] = {
      centro: c,
      inventoryType: t,
      cycleId: `${prefix}-${c}-${Date.now().toString().slice(-4)}`,
      status: 'NO_ASIGNADO',
      assignedToUserId: null,
      assignedToUserName: null,
      assignedToUserLogin: null,
      assignedByUserName: null,
      assignedAt: null,
      completedAt: null,
      signatureStamp: null,
      notes: ''
    };
    if (t === 'ciclico') {
      data.assignments[c] = data.assignments[key];
    }

    this.saveData(data);

    return {
      success: true,
      centro: c,
      inventoryType: t,
      status: 'CONCLUIDO',
      completedAt: now,
      completedBy: operatorName,
      assignment: concludedCycleSnapshot,
      historyEntry: concludedCycleSnapshot,
      message: `Inventario (${t.toUpperCase()}) del Centro ${c} concluido, firmado y hoja de conteo limpiada exitosamente.`
    };
  }

  /**
   * Validate Administrator / Encargado credentials against users.json
   */
  authorizeAdmin(username, password) {
    if (!username || !password) {
      return { authorized: false, reason: 'Usuario y contraseña de Administrador requeridos' };
    }
    try {
      const usersFile = storagePath.getDataFilePath('users.json');
      if (!fs.existsSync(usersFile)) {
        return { authorized: false, reason: 'Base de usuarios no encontrada' };
      }
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      const qUser = String(username).trim().toUpperCase();
      const qPass = String(password).trim();

      const matchedUser = users.find(u =>
        u.activo &&
        (String(u.usuario || '').trim().toUpperCase() === qUser ||
         String(u.nombre || '').trim().toUpperCase() === qUser ||
         String(u.id || '').trim() === qUser) &&
        String(u.password || '').trim() === qPass
      );

      if (!matchedUser) {
        return { authorized: false, reason: 'Credenciales incorrectas o usuario inactivo' };
      }

      const userRole = String(matchedUser.cargo || '').trim().toUpperCase();
      if (userRole !== 'ENCARGADO' && userRole !== 'ADMIN') {
        return { authorized: false, reason: 'El usuario no posee permisos de Encargado o Administrador' };
      }

      return {
        authorized: true,
        user: {
          id: matchedUser.id,
          nombre: matchedUser.nombre,
          usuario: matchedUser.usuario,
          cargo: matchedUser.cargo,
          centro: matchedUser.centro
        }
      };
    } catch (err) {
      return { authorized: false, reason: err.message };
    }
  }

  /**
   * Delete a cyclic inventory from history and restore items to the Planner
   * Requires Encargado / Admin password confirmation
   */
  async deleteCycle(centro, cycleId, { username, password }) {
    const c = String(centro || '1300');
    const auth = this.authorizeAdmin(username, password);
    if (!auth.authorized) {
      throw new Error(auth.reason || 'Credenciales de Encargado/Admin incorrectas');
    }

    const authUser = auth.user;
    const authRole = String(authUser.cargo || '').toUpperCase();
    const authCentro = String(authUser.centro || '').trim();

    // If Encargado, ensure scoped to own Centro
    if (authRole === 'ENCARGADO' && authCentro && authCentro !== 'TODOS' && authCentro !== c) {
      throw new Error(`Acceso denegado: Como Encargado del Centro ${authCentro}, solo puedes eliminar inventarios de tu propio centro.`);
    }

    const data = this.loadData();
    const idx = data.history.findIndex(h => h.cycleId === cycleId && String(h.centro) === c);
    if (idx === -1) {
      throw new Error(`Registro de inventario ${cycleId} no encontrado en el historial.`);
    }
    const deletedCycle = data.history[idx];
    const t = String(deletedCycle?.inventoryType || 'ciclico').toLowerCase().trim();
    const key = `${c}_${t}`;
    data.history.splice(idx, 1);

    // If the deleted cycle was the active assignment, reset it to NO_ASIGNADO
    const activeAssigned = data.assignments[key] || (t === 'ciclico' ? data.assignments[c] : null);
    if (activeAssigned && (activeAssigned.cycleId === cycleId || activeAssigned.status === 'ASIGNADO')) {
      const prefixMap = { ciclico: 'CYC', semanal: 'SEM', mensual: 'MEN', barrido: 'BAR' };
      const prefix = prefixMap[t] || 'CYC';
      const resetObj = {
        centro: c,
        inventoryType: t,
        cycleId: `${prefix}-${c}-${Date.now().toString().slice(-4)}`,
        status: 'NO_ASIGNADO',
        assignedToUserId: null,
        assignedToUserName: null,
        assignedToUserLogin: null,
        assignedByUserName: null,
        assignedAt: null,
        completedAt: null,
        signatureStamp: null,
        notes: ''
      };
      data.assignments[key] = resetObj;
      if (t === 'ciclico') data.assignments[c] = resetObj;
    }

    this.saveData(data);

    // Reset counts for Centro in Excel & Google Sheets so items return to pending in Plan de Cíclicos
    const config = configService.getConfig();
    const filePath = configService.getExcelPathForType(t);
    const targetUrl = configService.getUrlForType(t);
    try {
      if (fs.existsSync(filePath)) {
        await excelService.resetCycle(filePath, config.activeSheetName, config.columnMapping, {}, c);
      }
      if (targetUrl && config.syncMode === 'google_sheets') {
        const googleSheetService = require('./googleSheetService');
        await googleSheetService.resetCycle(targetUrl, c, {});
      }
    } catch (resetErr) {
      console.warn('Aviso restableciendo hoja de conteo al borrar cíclico:', resetErr.message);
    }

    return {
      success: true,
      cycleId,
      centro: c,
      inventoryType: t,
      message: `Inventario ${cycleId} (${t.toUpperCase()}) eliminado exitosamente. Los artículos han sido restaurados al Plan de Cíclicos del Centro ${c}.`
    };
  }

  /**
   * Record review and justification completion for a cycle in history
   */
  recordReviewCompleted(centro, { adminName, finalNotes, summary, googleDriveFileUrl, fileName, googleDriveFolderUrl }) {
    const c = String(centro || '1300');
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const data = this.loadData();

    // 1. Locate cycle in history (completed or active)
    let historyEntry = data.history.find(h => String(h.centro) === c);
    if (!historyEntry) {
      historyEntry = {
        cycleId: `CYC-${c}-${Date.now().toString().slice(-4)}`,
        centro: c,
        status: 'REVISADO_Y_JUSTIFICADO',
        completedAt: now,
        completedBy: adminName,
        assignedToUserName: 'Auxiliar',
        assignedByUserName: adminName,
        summary: summary || {}
      };
      data.history.unshift(historyEntry);
    }

    historyEntry.status = 'REVISADO_Y_JUSTIFICADO';
    historyEntry.isReviewed = true;
    historyEntry.isJustified = true;
    historyEntry.reviewedAt = now;
    historyEntry.reviewedBy = adminName;
    historyEntry.reviewNotes = finalNotes || '';
    historyEntry.justificationSummary = summary || {};
    if (googleDriveFileUrl) historyEntry.googleDriveFileUrl = googleDriveFileUrl;
    if (googleDriveFolderUrl) historyEntry.googleDriveFolderUrl = googleDriveFolderUrl;
    if (fileName) historyEntry.documentFileName = fileName;

    // 2. Ensure active assignment for this Centro is cleanly reset
    data.assignments[c] = {
      centro: c,
      cycleId: `CYC-${c}-${Date.now().toString().slice(-4)}`,
      status: 'NO_ASIGNADO',
      assignedToUserId: null,
      assignedToUserName: null,
      assignedToUserLogin: null,
      assignedByUserName: null,
      assignedAt: null,
      completedAt: null,
      signatureStamp: null,
      notes: ''
    };

    this.saveData(data);
    return historyEntry;
  }

  /**
   * Reopen a completed cyclic inventory under Administrator authorization
   */
  async reopenCycle(centro, cycleId, { authorizedBy, adminUserId, reopenReason = '' }) {
    const c = String(centro || '1300');
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const data = this.loadData();

    // 1. Locate cycle in history
    let targetCycle = data.history.find(h => h.cycleId === cycleId || (String(h.centro) === c && (h.status === 'CONCLUIDO' || h.status === 'REVISADO_Y_JUSTIFICADO')));
    if (!targetCycle) {
      throw new Error(`Inventario cíclico ${cycleId} no encontrado en el historial del Centro ${c}.`);
    }

    // 2. Update historical record state
    targetCycle.status = 'ASIGNADO';
    targetCycle.reopenedAt = now;
    targetCycle.reopenedBy = authorizedBy;
    targetCycle.reopenReason = reopenReason;
    targetCycle.notes = (targetCycle.notes ? targetCycle.notes + ' | ' : '') + `[Reabierto: ${now} por ${authorizedBy} - Motivo: ${reopenReason || 'Actualización autorizada'}]`;

    // 3. Reactivate as the active assignment for the centro
    const reactivatedAssignment = {
      ...targetCycle,
      status: 'ASIGNADO'
    };
    data.assignments[c] = reactivatedAssignment;
    this.saveData(data);

    // 4. Log reopening in Excel Audit sheet if available
    const config = configService.getConfig();
    const filePath = config.activeFilePath;
    if (fs.existsSync(filePath)) {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const cleanC = String(c || '1300').replace(/^Centro\s*/i, '').trim();
        let auditSheet = workbook.getWorksheet(`Auditoria_${cleanC}`) || workbook.getWorksheet('Auditoria_Conteos');
        if (auditSheet) {
          const auditId = `REABRIR-${c}-${Date.now().toString().slice(-4)}`;
          auditSheet.addRow([
            auditId,
            c,
            now,
            'TODO_EL_CICLO',
            `REAPERTURA AUTORIZADA: ${targetCycle.cycleId}`,
            'CENTRO COMPLETO',
            0,
            0,
            0,
            0,
            'REABIERTO_PARA_EDICION',
            authorizedBy,
            `Reapertura autorizada por ${authorizedBy}. Motivo: ${reopenReason}`
          ]);
          await excelService.safeWriteFile(workbook, filePath);
        }
      } catch (auditErr) {
        console.warn('Aviso guardando auditoría de reapertura:', auditErr.message);
      }
    }

    return {
      success: true,
      centro: c,
      cycleId: targetCycle.cycleId,
      status: 'ASIGNADO',
      reopenedAt: now,
      reopenedBy: authorizedBy,
      assignment: reactivatedAssignment,
      message: `Inventario cíclico ${targetCycle.cycleId} reabierto exitosamente para actualización.`
    };
  }
}

module.exports = new AssignmentService();
