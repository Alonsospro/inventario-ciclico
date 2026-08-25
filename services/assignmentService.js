const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');
const excelService = require('./excelService');
const configService = require('./configService');
const ExcelJS = require('exceljs');

const ASSIGNMENTS_FILE = storagePath.getDataFilePath('assignments.json');

class AssignmentService {
  constructor() {
    this.assignments = this.loadAssignments();
  }

  loadAssignments() {
    try {
      if (fs.existsSync(ASSIGNMENTS_FILE)) {
        const raw = fs.readFileSync(ASSIGNMENTS_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Error reading assignments file:', err.message);
    }
    return {};
  }

  saveAssignments() {
    try {
      const dir = path.dirname(ASSIGNMENTS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(this.assignments, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving assignments:', err.message);
    }
  }

  /**
   * Get assignment details for a specific Centro
   */
  getAssignment(centro) {
    const c = String(centro || '1300');
    return this.assignments[c] || {
      centro: c,
      cycleId: `CYC-${c}-001`,
      status: 'NO_ASIGNADO', // NO_ASIGNADO | ASIGNADO | CONCLUIDO
      assignedToUserId: null,
      assignedToUserName: null,
      assignedToUserLogin: null,
      assignedByUserName: null,
      assignedAt: null,
      completedAt: null,
      signatureStamp: null
    };
  }

  /**
   * Encargado assigns a cyclic count to a specific Auxiliar
   */
  assignCycle(centro, { assignedToUserId, assignedToUserName, assignedToUserLogin, assignedByUserName, notes = '' }) {
    const c = String(centro || '1300');
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const assignment = {
      centro: c,
      cycleId: `CYC-${c}-${Date.now().toString().slice(-4)}`,
      status: 'ASIGNADO',
      assignedToUserId,
      assignedToUserName,
      assignedToUserLogin,
      assignedByUserName: assignedByUserName || 'Encargado de Centro',
      assignedAt: now,
      completedAt: null,
      signatureStamp: null,
      notes
    };

    this.assignments[c] = assignment;
    this.saveAssignments();
    return assignment;
  }

  /**
   * Check if a given user is authorized to view and count this Centro's cycle
   */
  checkPermission(centro, user) {
    if (!user) {
      return { allowed: false, reason: 'No autenticado' };
    }

    // Encargados always have full visibility of all Centros and cycles
    if (user.cargo === 'ENCARGADO') {
      return {
        allowed: true,
        role: 'ENCARGADO',
        assignment: this.getAssignment(centro)
      };
    }

    // Auxiliar check
    const assignment = this.getAssignment(centro);
    
    // Check if cycle is assigned to this Auxiliar
    const isAssignedToThisUser = (
      assignment.status === 'ASIGNADO' &&
      (
        assignment.assignedToUserId === user.id ||
        (user.usuario && assignment.assignedToUserLogin && user.usuario.toUpperCase() === assignment.assignedToUserLogin.toUpperCase()) ||
        (user.nombre && assignment.assignedToUserName && user.nombre.toUpperCase() === assignment.assignedToUserName.toUpperCase())
      )
    );

    if (isAssignedToThisUser) {
      return {
        allowed: true,
        role: 'AUXILIAR',
        assignment
      };
    }

    // Not assigned
    return {
      allowed: false,
      role: 'AUXILIAR',
      assignment,
      reason: assignment.status === 'NO_ASIGNADO'
        ? `No hay ningún inventario cíclico asignado para el Centro ${centro}. El Encargado debe asignar la orden de conteo.`
        : `El inventario cíclico actual del Centro ${centro} está asignado a ${assignment.assignedToUserName || 'otro auxiliar'}.`
    };
  }

  /**
   * Conclude and digitally sign cyclic count in Excel
   */
  async concludeAndSignCycle(centro, { signatureBase64, operatorName, operatorRole, notes = '' }) {
    const c = String(centro || '1300');
    const assignment = this.getAssignment(c);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const config = configService.getConfig();
    const filePath = config.activeFilePath;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Archivo Excel no encontrado: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Resolve Centro worksheet
    const worksheet = excelService.resolveWorksheet(workbook, c);
    if (!worksheet) {
      throw new Error(`Pestaña del Centro ${c} no encontrada en Excel.`);
    }

    // 1. Add Signature Image to Excel if provided
    let imageId = null;
    if (signatureBase64 && signatureBase64.includes('base64,')) {
      const cleanBase64 = signatureBase64.split('base64,')[1];
      imageId = workbook.addImage({
        base64: cleanBase64,
        extension: 'png'
      });

      // Insert signature image at bottom of worksheet
      const lastRow = Math.max(worksheet.rowCount + 2, 25);
      
      // Signature Section Label
      const signLabelRow = worksheet.getRow(lastRow);
      signLabelRow.getCell('A').value = `FIRMA DIGITAL DE CONFORMIDAD - INVENTARIO CÍCLICO CONCLUIDO`;
      signLabelRow.getCell('A').font = { bold: true, color: { argb: 'FF1E293B' }, size: 11 };

      const detailsRow = worksheet.getRow(lastRow + 1);
      detailsRow.getCell('A').value = `Firmado por: ${operatorName} (${operatorRole || 'Operador'}) | Fecha: ${now} | Estado: CONCLUIDO Y AUDITADO`;
      detailsRow.getCell('A').font = { italic: true, color: { argb: 'FF475569' }, size: 9 };

      // Position the signature image below labels
      worksheet.addImage(imageId, {
        tl: { col: 0, row: lastRow + 2 },
        ext: { width: 260, height: 90 }
      });
    }

    // 2. Add Closure Log in Auditoria_Conteos
    const auditSheetName = 'Auditoria_Conteos';
    let auditSheet = workbook.getWorksheet(auditSheetName);
    if (auditSheet) {
      const closureId = `CIERRE-${c}-${Date.now().toString().slice(-4)}`;
      auditSheet.addRow([
        closureId,
        c,
        now,
        'TODO_EL_CICLO',
        'CIERRE Y FIRMA DIGITAL DE INVENTARIO CÍCLICO',
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

    // Write changes safely
    await excelService.safeWriteFile(workbook, filePath);

    // Update assignment status in memory & JSON
    assignment.status = 'CONCLUIDO';
    assignment.completedAt = now;
    assignment.completedBy = operatorName;
    assignment.signatureStamp = {
      signedBy: operatorName,
      signedAt: now,
      role: operatorRole || 'Operador',
      signaturePresent: !!signatureBase64
    };

    this.assignments[c] = assignment;
    this.saveAssignments();

    return {
      success: true,
      centro: c,
      status: 'CONCLUIDO',
      completedAt: now,
      completedBy: operatorName,
      message: `Inventario Cíclico del Centro ${c} concluido y firmado exitosamente en Excel.`
    };
  }
}

module.exports = new AssignmentService();
