const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Default standard column mapping
const DEFAULT_MAPPING = {
  sku: 'A',
  barcode: 'B',
  description: 'C',
  location: 'D',
  category: 'E',
  abcClass: 'F',
  unit: 'G',
  unitCost: 'H',
  systemStock: 'I',
  physicalStock: 'J',
  variance: 'K',
  varianceCost: 'L',
  lastCountDate: 'M',
  counterName: 'N',
  status: 'O'
};

const DEFAULT_HEADERS = {
  A: 'SKU',
  B: 'Codigo_Barras',
  C: 'Descripcion',
  D: 'Ubicacion',
  E: 'Categoria',
  F: 'Clasificacion_ABC',
  G: 'Unidad',
  H: 'Costo_Unitario',
  I: 'Stock_Sistema',
  J: 'Stock_Fisico',
  K: 'Diferencia',
  L: 'Costo_Diferencia',
  M: 'Fecha_Ultimo_Conteo',
  N: 'Responsable',
  O: 'Estado'
};

const CENTROS_CONFIG = [
  { codigo: '1300', nombre: 'Almacén Central Principal', prefix: 'C1300' },
  { codigo: '1800', nombre: 'Sucursal Norte', prefix: 'C1800' },
  { codigo: '1340', nombre: 'Distribución & Parque Industrial', prefix: 'C1340' },
  { codigo: '1820', nombre: 'Repuestos & Taller Principal', prefix: 'C1820' },
  { codigo: '1120', nombre: 'Almacén Oriente', prefix: 'C1120' },
  { codigo: '1180', nombre: 'Logística & Sector Sur', prefix: 'C1180' },
  { codigo: '1700', nombre: 'Sucursal Repuestos & Zona Comercial', prefix: 'C1700' },
  { codigo: '1160', nombre: 'Bodega General & Sector Industrial', prefix: 'C1160' },
  { codigo: '1320', nombre: 'Centro Integral & Sucursal Este', prefix: 'C1320' },
  { codigo: '1310', nombre: 'Módulos Express', prefix: 'C1310' },
  { codigo: '5100', nombre: 'Hub Regional', prefix: 'C5100' },
  { codigo: '3100', nombre: 'Almacén Occidente', prefix: 'C3100' },
  { codigo: '2100', nombre: 'Planta Operativa Principal', prefix: 'C2100' }
];

class ExcelService {
  constructor() {
    this.activeFilePath = null;
    this.activeSheetName = '1300';
    this.columnMapping = { ...DEFAULT_MAPPING };
  }

  /**
   * Normalize text for fuzzy comparison
   */
  normalizeHeader(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Resolves the target worksheet based on Centro or explicit sheet name
   */
  resolveWorksheet(workbook, centro, explicitSheetName) {
    if (!workbook || workbook.worksheets.length === 0) return null;

    // 1. Try matching with centro code (e.g. '1300', 'Centro_1300', 'Centro 1300', 'C1300')
    if (centro) {
      const cStr = String(centro).trim().toLowerCase();
      for (const ws of workbook.worksheets) {
        const wsNameNorm = ws.name.toLowerCase().trim();
        if (
          wsNameNorm === cStr ||
          wsNameNorm === `centro_${cStr}` ||
          wsNameNorm === `centro ${cStr}` ||
          wsNameNorm === `c${cStr}` ||
          wsNameNorm.includes(cStr)
        ) {
          return ws;
        }
      }
    }

    // 2. Try explicit sheet name
    if (explicitSheetName) {
      const ws = workbook.getWorksheet(explicitSheetName);
      if (ws) return ws;
    }

    // 3. Fallback: first non-audit worksheet
    const nonAudit = workbook.worksheets.find(w => w.name !== 'Auditoria_Conteos');
    return nonAudit || workbook.worksheets[0];
  }

  /**
   * Safely write Excel file with retry mechanism for Windows EBUSY locks
   */
  async safeWriteFile(workbook, filePath, maxRetries = 3, delayMs = 400) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await workbook.xlsx.writeFile(filePath);
        return true;
      } catch (err) {
        if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < maxRetries) {
          console.warn(`[ExcelService] Archivo en uso, reintentando guardar (${attempt}/${maxRetries})...`);
          await new Promise(res => setTimeout(res, delayMs));
        } else if (err.code === 'EBUSY' || err.code === 'EPERM') {
          const fileName = path.basename(filePath);
          throw new Error(`⚠️ El archivo '${fileName}' está abierto en Microsoft Excel. Por favor cierra la ventana de Excel en tu computadora para permitir que la aplicación web guarde los cambios en tiempo real.`);
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Get list of sheets and header structure of an Excel file
   */
  async inspectWorkbook(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Archivo no encontrado: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets = [];
    workbook.eachSheet((worksheet) => {
      const row1 = worksheet.getRow(1);
      const headers = {};

      row1.eachCell((cell, colNumber) => {
        const colLetter = this.colNumberToLetter(colNumber);
        headers[colLetter] = this.getCellValue(cell);
      });

      sheets.push({
        name: worksheet.name,
        rowCount: worksheet.rowCount > 0 ? worksheet.rowCount - 1 : 0,
        headers,
        isAuditSheet: worksheet.name === 'Auditoria_Conteos'
      });
    });

    return {
      fileName: path.basename(filePath),
      sheetCount: workbook.worksheets.length,
      sheets
    };
  }

  /**
   * Convert column number (1-based) to Excel letter (A, B, ..., Z, AA, AB)
   */
  colNumberToLetter(colNum) {
    let temp, letter = '';
    while (colNum > 0) {
      temp = (colNum - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      colNum = (colNum - temp - 1) / 26;
    }
    return letter;
  }

  /**
   * Helper to safely extract string value from an ExcelJS Cell
   */
  getCellValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object') {
      if (cell.value.text) return String(cell.value.text).trim();
      if (cell.value.result !== undefined) return String(cell.value.result).trim();
      if (cell.value instanceof Date) return cell.value.toISOString();
    }
    return String(cell.value).trim();
  }

  /**
   * Read inventory items from a specific Centro worksheet
   */
  async readInventory(filePath, sheetName, mapping, centro = null) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo de inventario no existe en la ruta: ${filePath}`);
    }

    const map = mapping || this.columnMapping || DEFAULT_MAPPING;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = this.resolveWorksheet(workbook, centro, sheetName);
    if (!worksheet) {
      throw new Error(`No se encontró la pestaña correspondiente al Centro ${centro || sheetName}`);
    }

    const items = [];
    const totalRows = worksheet.rowCount;

    for (let r = 2; r <= totalRows; r++) {
      const row = worksheet.getRow(r);
      const sku = this.getCellValue(row.getCell(map.sku));

      if (!sku) continue;

      const barcode = map.barcode ? this.getCellValue(row.getCell(map.barcode)) : '';
      const description = map.description ? this.getCellValue(row.getCell(map.description)) : '';
      const location = map.location ? this.getCellValue(row.getCell(map.location)) : 'S/U';
      const category = map.category ? this.getCellValue(row.getCell(map.category)) : 'General';
      const abcClass = (map.abcClass ? this.getCellValue(row.getCell(map.abcClass)) : 'B').toUpperCase();
      const unit = map.unit ? this.getCellValue(row.getCell(map.unit)) : 'UND';

      const unitCostRaw = map.unitCost ? Number(this.getCellValue(row.getCell(map.unitCost))) : 0;
      const unitCost = isNaN(unitCostRaw) ? 0 : unitCostRaw;

      const systemStockRaw = map.systemStock ? Number(this.getCellValue(row.getCell(map.systemStock))) : 0;
      const systemStock = isNaN(systemStockRaw) ? 0 : systemStockRaw;

      const physicalStockCell = map.physicalStock ? row.getCell(map.physicalStock) : null;
      let physicalStock = null;
      if (physicalStockCell && physicalStockCell.value !== null && physicalStockCell.value !== undefined && physicalStockCell.value !== '') {
        const pVal = Number(this.getCellValue(physicalStockCell));
        physicalStock = isNaN(pVal) ? null : pVal;
      }

      let variance = null;
      let varianceCost = null;
      if (physicalStock !== null) {
        variance = physicalStock - systemStock;
        varianceCost = Number((variance * unitCost).toFixed(2));
      }

      const lastCountDate = map.lastCountDate ? this.getCellValue(row.getCell(map.lastCountDate)) : '';
      const counterName = map.counterName ? this.getCellValue(row.getCell(map.counterName)) : '';
      
      let status = 'Pendiente';
      if (physicalStock !== null) {
        if (variance === 0) status = 'Cuadrado';
        else if (variance < 0) status = 'Faltante';
        else status = 'Sobrante';
      }

      items.push({
        rowNumber: r,
        sku: String(sku).trim(),
        barcode: String(barcode || sku).trim(),
        description: String(description).trim(),
        location: String(location).trim(),
        category: String(category).trim(),
        abcClass: abcClass.length === 1 ? abcClass : 'B',
        unit: String(unit).trim(),
        unitCost: unitCost,
        systemStock: systemStock,
        physicalStock: physicalStock,
        variance: variance,
        varianceCost: varianceCost,
        lastCountDate: lastCountDate,
        counterName: counterName,
        status: status,
        centro: centro || worksheet.name
      });
    }

    return {
      totalItems: items.length,
      sheetName: worksheet.name,
      centro: centro || worksheet.name,
      items
    };
  }

  /**
   * Updates physical stock count for an item in its Centro worksheet and logs to Audit
   */
  async updateItemCount(filePath, sheetName, mapping, countData) {
    const { sku, physicalStock, counterName, centro = null, notes = '', unitCost = 0, systemStock = 0 } = countData;
    const map = mapping || this.columnMapping || DEFAULT_MAPPING;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = this.resolveWorksheet(workbook, centro, sheetName);
    if (!worksheet) {
      throw new Error(`Pestaña de Centro no encontrada: ${centro || sheetName}`);
    }

    // Find row by SKU or Barcode
    let targetRow = null;
    let rowNum = -1;

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const rowSku = this.getCellValue(row.getCell(map.sku));
      const rowBarcode = this.getCellValue(row.getCell(map.barcode));

      if (
        (rowSku && String(rowSku).trim().toLowerCase() === String(sku).trim().toLowerCase()) ||
        (rowBarcode && String(rowBarcode).trim().toLowerCase() === String(sku).trim().toLowerCase())
      ) {
        targetRow = row;
        rowNum = r;
        break;
      }
    }

    if (!targetRow) {
      throw new Error(`Producto con código/SKU "${sku}" no fue encontrado en la pestaña del Centro ${worksheet.name}.`);
    }

    const currentSystemStock = Number(this.getCellValue(targetRow.getCell(map.systemStock))) || systemStock || 0;
    const currentCost = Number(this.getCellValue(targetRow.getCell(map.unitCost))) || unitCost || 0;
    const countedVal = Number(physicalStock);
    const varianceVal = countedVal - currentSystemStock;
    const varianceCostVal = Number((varianceVal * currentCost).toFixed(2));
    
    let statusText = 'Cuadrado';
    if (varianceVal < 0) statusText = 'Faltante';
    if (varianceVal > 0) statusText = 'Sobrante';

    const now = new Date();
    const formattedDate = now.toISOString().replace('T', ' ').substring(0, 19);

    // Update main inventory row in this Centro's sheet
    targetRow.getCell(map.physicalStock).value = countedVal;
    if (map.variance) targetRow.getCell(map.variance).value = varianceVal;
    if (map.varianceCost) targetRow.getCell(map.varianceCost).value = varianceCostVal;
    if (map.lastCountDate) targetRow.getCell(map.lastCountDate).value = formattedDate;
    if (map.counterName) targetRow.getCell(map.counterName).value = counterName || 'Operador Web';
    if (map.status) targetRow.getCell(map.status).value = statusText;

    targetRow.commit();

    // Ensure Historical Audit Sheet exists
    const auditSheetName = 'Auditoria_Conteos';
    let auditSheet = workbook.getWorksheet(auditSheetName);
    if (!auditSheet) {
      auditSheet = workbook.addWorksheet(auditSheetName, {
        views: [{ state: 'frozen', ySplit: 1 }]
      });
      
      const auditHeaders = [
        'ID_Conteo',
        'Centro',
        'Fecha_Hora',
        'SKU',
        'Descripcion',
        'Ubicacion',
        'Stock_Sistema',
        'Stock_Fisico_Contado',
        'Diferencia',
        'Costo_Diferencia',
        'Estado',
        'Responsable',
        'Notas_Observaciones'
      ];
      
      const headerRow = auditSheet.addRow(auditHeaders);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      auditSheet.columns = [
        { width: 14 },
        { width: 12 },
        { width: 20 },
        { width: 16 },
        { width: 34 },
        { width: 16 },
        { width: 14 },
        { width: 18 },
        { width: 14 },
        { width: 18 },
        { width: 14 },
        { width: 20 },
        { width: 30 }
      ];
    }

    const description = this.getCellValue(targetRow.getCell(map.description)) || '';
    const location = this.getCellValue(targetRow.getCell(map.location)) || '';
    const auditId = `CNT-${Date.now().toString().slice(-6)}`;

    auditSheet.addRow([
      auditId,
      worksheet.name,
      formattedDate,
      this.getCellValue(targetRow.getCell(map.sku)),
      description,
      location,
      currentSystemStock,
      countedVal,
      varianceVal,
      varianceCostVal,
      statusText,
      counterName || 'Operador Web',
      notes
    ]);

    await this.safeWriteFile(workbook, filePath);

    return {
      success: true,
      sku,
      centro: worksheet.name,
      physicalStock: countedVal,
      systemStock: currentSystemStock,
      variance: varianceVal,
      varianceCost: varianceCostVal,
      status: statusText,
      lastCountDate: formattedDate,
      counterName: counterName || 'Operador Web'
    };
  }

  /**
   * Reset cycle for a specific Centro's sheet
   */
  async resetCycle(filePath, sheetName, mapping, filter = {}, centro = null) {
    const map = mapping || this.columnMapping || DEFAULT_MAPPING;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = this.resolveWorksheet(workbook, centro, sheetName);
    if (!worksheet) {
      throw new Error(`Pestaña de Centro no encontrada: ${centro || sheetName}`);
    }

    let resetCount = 0;
    const { location, abcClass } = filter;

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const sku = this.getCellValue(row.getCell(map.sku));
      if (!sku) continue;

      const rowLoc = this.getCellValue(row.getCell(map.location));
      const rowAbc = this.getCellValue(row.getCell(map.abcClass)).toUpperCase();

      if (location && rowLoc.toLowerCase() !== location.toLowerCase()) continue;
      if (abcClass && rowAbc !== abcClass.toUpperCase()) continue;

      row.getCell(map.physicalStock).value = null;
      if (map.variance) row.getCell(map.variance).value = null;
      if (map.varianceCost) row.getCell(map.varianceCost).value = null;
      if (map.status) row.getCell(map.status).value = 'Pendiente';
      
      row.commit();
      resetCount++;
    }

    await this.safeWriteFile(workbook, filePath);
    return { success: true, resetCount, centro: worksheet.name };
  }

  /**
   * Generate an ultra-complete multi-sheet Excel file with 13 Centros tabs + Audit
   */
  async createSampleInventoryExcel(destinationPath) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CyclicStock PRO - Multicentros';
    workbook.created = new Date();

    // Sample catalogue base
    const baseCatalog = [
      { sku: 'ELC-101', barcode: '7701001', desc: 'Laptop Dell Latitude 5420 i7 16GB', cat: 'Computación', abc: 'A', uom: 'UND', cost: 950.00 },
      { sku: 'ELC-102', barcode: '7701002', desc: 'Monitor LG UltraWide 29 Pulgadas', cat: 'Monitores', abc: 'A', uom: 'UND', cost: 240.00 },
      { sku: 'ELC-103', barcode: '7701003', desc: 'Teclado Mecánico RGB Redragon', cat: 'Periféricos', abc: 'B', uom: 'UND', cost: 45.00 },
      { sku: 'ELC-104', barcode: '7701004', desc: 'Mouse Inalámbrico Logitech MX Master', cat: 'Periféricos', abc: 'A', uom: 'UND', cost: 99.00 },
      { sku: 'ELC-105', barcode: '7701005', desc: 'Cable HDMI 2.1 Ultra High Speed 3M', cat: 'Cables', abc: 'C', uom: 'UND', cost: 12.50 },
      { sku: 'ELC-106', barcode: '7701006', desc: 'Disco Duro SSD Kingston 1TB NVMe', cat: 'Almacenamiento', abc: 'A', uom: 'UND', cost: 85.00 },
      { sku: 'ELC-107', barcode: '7701007', desc: 'Memoria RAM Corsair 16GB DDR4', cat: 'Componentes', abc: 'B', uom: 'UND', cost: 52.00 },
      { sku: 'ELC-108', barcode: '7701008', desc: 'Router Wi-Fi 6 TP-Link Archer AX55', cat: 'Redes', abc: 'B', uom: 'UND', cost: 79.00 },
      
      { sku: 'HER-201', barcode: '7702001', desc: 'Taladro Percutor DeWalt 20V Max', cat: 'Herramientas', abc: 'A', uom: 'UND', cost: 165.00 },
      { sku: 'HER-202', barcode: '7702002', desc: 'Juego Destornilladores 1000V', cat: 'Herramientas', abc: 'B', uom: 'JGO', cost: 32.00 },
      { sku: 'HER-203', barcode: '7702003', desc: 'Multímetro Digital Fluke 117', cat: 'Instrumentación', abc: 'A', uom: 'UND', cost: 210.00 },
      { sku: 'HER-204', barcode: '7702004', desc: 'Cinta Métrica Stanley FatMax 8M', cat: 'Herramientas', abc: 'C', uom: 'UND', cost: 14.00 },
      { sku: 'HER-205', barcode: '7702005', desc: 'Alicate Pelacables Automático', cat: 'Herramientas', abc: 'C', uom: 'UND', cost: 19.50 },

      { sku: 'SEG-301', barcode: '7703001', desc: 'Casco de Seguridad Industrial ANSI', cat: 'EPP Seguridad', abc: 'B', uom: 'UND', cost: 15.00 },
      { sku: 'SEG-302', barcode: '7703002', desc: 'Lentes de Seguridad Anti-empañante 3M', cat: 'EPP Seguridad', abc: 'C', uom: 'UND', cost: 6.50 },
      { sku: 'SEG-303', barcode: '7703003', desc: 'Guantes Nitrilo Anticorte Nivel 5', cat: 'EPP Seguridad', abc: 'B', uom: 'PAR', cost: 9.80 },
      { sku: 'SEG-304', barcode: '7703004', desc: 'Botas de Seguridad Punta de Acero', cat: 'EPP Seguridad', abc: 'A', uom: 'PAR', cost: 68.00 },

      { sku: 'SUM-401', barcode: '7704001', desc: 'Rollo Film Stretch Embalaje 500m', cat: 'Embalaje', abc: 'C', uom: 'ROL', cost: 11.20 },
      { sku: 'SUM-402', barcode: '7704002', desc: 'Cinta Embalaje Transparente 48mm', cat: 'Embalaje', abc: 'C', uom: 'UND', cost: 2.10 },
      { sku: 'SUM-403', barcode: '7704003', desc: 'Impresora Térmica Zebra ZD220', cat: 'Equipos', abc: 'A', uom: 'UND', cost: 280.00 },
      { sku: 'SUM-404', barcode: '7704004', desc: 'Lector Código de Barras Láser USB', cat: 'Equipos', abc: 'B', uom: 'UND', cost: 75.00 }
    ];

    // Create 13 Sheets: One for each Centro
    for (const centro of CENTROS_CONFIG) {
      const sheetName = centro.codigo;
      const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 1 }]
      });

      worksheet.columns = [
        { key: 'A', width: 14 },
        { key: 'B', width: 18 },
        { key: 'C', width: 36 },
        { key: 'D', width: 15 },
        { key: 'E', width: 18 },
        { key: 'F', width: 16 },
        { key: 'G', width: 10 },
        { key: 'H', width: 15 },
        { key: 'I', width: 15 },
        { key: 'J', width: 15 },
        { key: 'K', width: 14 },
        { key: 'L', width: 18 },
        { key: 'M', width: 22 },
        { key: 'N', width: 18 },
        { key: 'O', width: 15 }
      ];

      const headerRow = worksheet.addRow(Object.values(DEFAULT_HEADERS));
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0F172A' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          bottom: { style: 'medium', color: { argb: 'FF3B82F6' } }
        };
      });

      // Populate with items customized per Centro
      baseCatalog.forEach((prod, index) => {
        const aisleNum = ((index % 5) + 1).toString().padStart(2, '0');
        const shelfLetter = String.fromCharCode(65 + (index % 3));
        const shelfLevel = ((index % 2) + 1);
        const location = `PAS-${aisleNum}-${shelfLetter}${shelfLevel}`;

        // Seed realistic stock variations per centro
        const centroSeed = parseInt(centro.codigo, 10) % 17;
        const baseStock = Math.max(5, Math.floor(((index + 3) * 7 + centroSeed * 3) % 120));
        const customSku = `${prod.sku}-${centro.codigo}`;

        const row = worksheet.addRow([
          customSku,
          `${prod.barcode}${centro.codigo.slice(-2)}`,
          `${prod.desc} [Centro ${centro.codigo}]`,
          location,
          prod.cat,
          prod.abc,
          prod.uom,
          prod.cost,
          baseStock,
          null, // Stock_Fisico inicial
          null,
          null,
          '',
          '',
          'Pendiente'
        ]);

        const isEven = index % 2 === 0;
        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Segoe UI', size: 10 };
          cell.alignment = { vertical: 'middle' };
          if (isEven) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          }
          if ([1, 2, 4, 6, 7, 13, 14, 15].includes(colNum)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
          if ([8, 12].includes(colNum)) {
            cell.numFmt = '$#,##0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
          if ([9, 10, 11].includes(colNum)) {
            cell.numFmt = '#,##0';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        });
      });
    }

    // Add Global Audit Sheet
    const auditSheet = workbook.addWorksheet('Auditoria_Conteos', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    
    auditSheet.columns = [
      { width: 14 },
      { width: 12 },
      { width: 20 },
      { width: 16 },
      { width: 34 },
      { width: 16 },
      { width: 14 },
      { width: 18 },
      { width: 14 },
      { width: 18 },
      { width: 14 },
      { width: 20 },
      { width: 30 }
    ];

    const auditHeader = auditSheet.addRow([
      'ID_Conteo', 'Centro', 'Fecha_Hora', 'SKU', 'Descripcion', 'Ubicacion', 
      'Stock_Sistema', 'Stock_Fisico_Contado', 'Diferencia', 'Costo_Diferencia', 
      'Estado', 'Responsable', 'Notas_Observaciones'
    ]);
    auditHeader.height = 26;
    auditHeader.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const dir = path.dirname(destinationPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await this.safeWriteFile(workbook, destinationPath);
    return destinationPath;
  }

  /**
   * Calculate accuracy (IRA) and analytics for a Centro or entire workbook
   */
  async getAnalytics(filePath, sheetName, mapping, centro = null) {
    const invData = await this.readInventory(filePath, sheetName, mapping, centro);
    const items = invData.items;

    const totalItems = items.length;
    const countedItems = items.filter(i => i.physicalStock !== null);
    const pendingItems = totalItems - countedItems.length;

    const exactMatches = countedItems.filter(i => i.variance === 0).length;
    const missingItems = countedItems.filter(i => i.variance < 0).length;
    const surplusItems = countedItems.filter(i => i.variance > 0).length;

    const iraPercentage = countedItems.length > 0
      ? Number(((exactMatches / countedItems.length) * 100).toFixed(1))
      : 100.0;

    const cycleProgress = totalItems > 0
      ? Number(((countedItems.length / totalItems) * 100).toFixed(1))
      : 0.0;

    let netVarianceCost = 0;
    let absoluteVarianceCost = 0;

    countedItems.forEach(i => {
      if (i.varianceCost !== null) {
        netVarianceCost += i.varianceCost;
        absoluteVarianceCost += Math.abs(i.varianceCost);
      }
    });

    const abcStats = {
      A: { total: 0, counted: 0, exact: 0, discrepancies: 0 },
      B: { total: 0, counted: 0, exact: 0, discrepancies: 0 },
      C: { total: 0, counted: 0, exact: 0, discrepancies: 0 }
    };

    items.forEach(i => {
      const cls = ['A', 'B', 'C'].includes(i.abcClass) ? i.abcClass : 'B';
      abcStats[cls].total++;
      if (i.physicalStock !== null) {
        abcStats[cls].counted++;
        if (i.variance === 0) abcStats[cls].exact++;
        else abcStats[cls].discrepancies++;
      }
    });

    const topDiscrepancies = countedItems
      .filter(i => i.variance !== 0)
      .sort((a, b) => Math.abs(b.varianceCost || 0) - Math.abs(a.varianceCost || 0))
      .slice(0, 10);

    return {
      centro: invData.centro,
      sheetName: invData.sheetName,
      totalItems,
      countedItems: countedItems.length,
      pendingItems,
      exactMatches,
      missingItems,
      surplusItems,
      iraPercentage,
      cycleProgress,
      netVarianceCost: Number(netVarianceCost.toFixed(2)),
      absoluteVarianceCost: Number(absoluteVarianceCost.toFixed(2)),
      abcStats,
      topDiscrepancies
    };
  }
}

module.exports = new ExcelService();
