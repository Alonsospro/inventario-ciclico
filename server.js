const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');

process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

const excelService = require('./services/excelService');
const configService = require('./services/configService');
const usersService = require('./services/usersService');
const storagePath = require('./services/storagePath');
const googleSheetService = require('./services/googleSheetService');

const app = express();
const PORT = process.env.PORT || 3000;

const assignmentService = require('./services/assignmentService');
const auditService = require('./services/auditService');
const justificationService = require('./services/justificationService');

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for Excel file uploads & Justification Photo uploads
const uploadsDir = storagePath.getUploadsDir();
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xlsm|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de Excel (.xlsx, .xlsm, .xls)'));
    }
  }
});

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const centro = req.body.centro || req.query.centro || '1300';
    const folderInfo = justificationService.getCycleUploadDir(centro);
    cb(null, folderInfo.absolutePath);
  },
  filename: (req, file, cb) => {
    const sku = req.body.sku || req.query.sku || 'SKU';
    const itemName = req.body.description || req.query.description || 'Item';
    const ext = path.extname(file.originalname) || '.jpg';
    const generatedName = justificationService.generatePhotoFilename(sku, itemName, ext);
    cb(null, generatedName);
  }
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.originalname.match(/\.(jpg|jpeg|png|webp|heic|gif)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (JPG, PNG, WEBP)'));
    }
  }
});

const damagedPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const centro = req.body.centro || req.query.centro || '1300';
    const dateStr = req.body.date || new Date().toISOString().substring(0, 10);
    const targetDir = path.join(storagePath.getUploadsDir(), 'respaldo_grafico', 'ciclico', `${centro}_${dateStr}`);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const sku = (req.body.sku || req.query.sku || 'SKU').replace(/[^a-zA-Z0-9_-]/g, '_');
    const centro = req.body.centro || req.query.centro || '1300';
    const dateStr = req.body.date || new Date().toISOString().substring(0, 10);
    const ext = path.extname(file.originalname) || '.jpg';
    const timeStr = new Date().toISOString().replace(/[-:T]/g, '').substring(8, 14);
    cb(null, `${dateStr}_${centro}_${sku}_MAL_ESTADO_${timeStr}${ext}`);
  }
});

const uploadDamagedPhoto = multer({
  storage: damagedPhotoStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.originalname.match(/\.(jpg|jpeg|png|webp|heic|gif)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (JPG, PNG, WEBP)'));
    }
  }
});

// Helper to get local network IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// -------------------------------------------------------------
// Initialize sample data if no active file exists
// -------------------------------------------------------------
async function initializeApp() {
  storagePath.ensureDataDirectory();
  const config = configService.getConfig();
  if (!fs.existsSync(config.activeFilePath)) {
    console.log('Creando archivo de inventario de muestra inicial...');
    const samplePath = storagePath.getDataFilePath('CICLICOS NIBOL MULTIMARCAS.xlsx');
    await excelService.createSampleInventoryExcel(samplePath);
    configService.saveConfig({ activeFilePath: samplePath });
    console.log(`Archivo de muestra creado en: ${samplePath}`);
  }
}

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// 0. Centros & Authentication
app.get('/api/centros', (req, res) => {
  try {
    const centros = usersService.getCentros();
    res.json({ success: true, centros });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password, centro } = req.body || {};
    const result = usersService.authenticate(username, password, centro);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/users', (req, res) => {
  try {
    const { centro } = req.query;
    const users = usersService.getPublicUsers(centro);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/users/all', (req, res) => {
  try {
    const { centro } = req.query;
    const users = usersService.getAllUsersWithDetails(centro);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/users', (req, res) => {
  try {
    const requestingUser = req.body.requestingUser || req.headers['x-requesting-user'];
    const newUser = usersService.addUser(req.body, requestingUser);
    res.json({ success: true, user: newUser });
  } catch (err) {
    res.status(403).json({ success: false, error: err.message });
  }
});

app.put('/api/auth/users/:id', (req, res) => {
  try {
    const requestingUser = req.body.requestingUser || req.headers['x-requesting-user'];
    const updated = usersService.updateUser(req.params.id, req.body, requestingUser);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(403).json({ success: false, error: err.message });
  }
});

app.delete('/api/auth/users/:id', (req, res) => {
  try {
    const requestingUser = req.body.requestingUser || req.query.requestingUser || req.headers['x-requesting-user'];
    const result = usersService.deleteUser(req.params.id, requestingUser);
    res.json(result);
  } catch (err) {
    res.status(403).json({ success: false, error: err.message });
  }
});

// 0.1 Assignments, Multi-Inventory Tasks & Digital Signature
app.get('/api/assignments', (req, res) => {
  try {
    const { centro, type, inventoryType } = req.query;
    const t = type || inventoryType || 'ciclico';
    const assignment = assignmentService.getAssignment(centro || '1300', t);
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory/tasks-summary', async (req, res) => {
  try {
    let centro = req.query.centro || '1300';
    const userRole = String(req.query.userCargo || '').toUpperCase();
    const uCentro = String(req.query.userCentro || '').trim();

    // Strict Centro Scoping for Encargados & Auxiliares
    if ((userRole === 'ENCARGADO' || userRole === 'AUXILIAR') && uCentro && uCentro !== 'TODOS') {
      centro = uCentro;
    }

    const types = configService.getAllInventoryTypes();
    const config = configService.getConfig();

    const tasks = await Promise.all(types.map(async (meta) => {
      const t = meta.id;
      const assignment = assignmentService.getAssignment(centro, t);
      const targetUrl = configService.getUrlForType(t);
      const filePath = configService.getExcelPathForType(t);

      let summary = {
        totalItems: 0,
        countedItems: 0,
        pendingItems: 0,
        iraPercentage: 100,
        discrepancies: 0,
        netVarianceCost: 0
      };

      try {
        if (targetUrl && config.syncMode === 'google_sheets') {
          const analytics = await googleSheetService.getAnalytics(targetUrl, centro);
          if (analytics) summary = analytics;
        } else if (fs.existsSync(filePath)) {
          summary = await excelService.getAnalytics(filePath, config.activeSheetName, config.columnMapping, centro);
        }
      } catch (e) {
        // Fallback with zero stats if sheet is not yet initialized
      }

      return {
        type: t,
        name: meta.name,
        fileTitle: meta.fileTitle,
        excelFile: meta.excelFile,
        description: meta.description,
        icon: meta.icon,
        color: meta.color,
        badgeClass: meta.badgeClass,
        isConfigured: meta.isConfigured,
        googleSheetUrl: targetUrl,
        assignment,
        summary
      };
    }));

    res.json({ success: true, centro, tasks });
  } catch (err) {
    console.error('Error fetching tasks summary:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/assignments/check-user', (req, res) => {
  try {
    const { centro, userId, userCargo, userName, userLogin, type, inventoryType } = req.query;
    const user = {
      id: userId,
      cargo: userCargo,
      nombre: userName,
      usuario: userLogin || userName,
      centro: centro || '1300'
    };
    const c = centro || '1300';
    const activeAssignment = assignmentService.getUserActiveAssignment(c, user);
    res.json({
      success: true,
      hasActiveAssignment: Boolean(activeAssignment),
      assignment: activeAssignment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assignments/history', (req, res) => {
  try {
    const { centro, status, search, userCargo, userCentro, type, inventoryType } = req.query;
    const requestingUser = {
      cargo: userCargo,
      centro: userCentro
    };
    const history = assignmentService.getHistory({
      centro,
      status,
      search,
      requestingUser,
      inventoryType: type || inventoryType
    });
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignments/assign', (req, res) => {
  try {
    const { centro, assignedToUserId, assignedToUserName, assignedToUserLogin, assignedByUserName, assignedByUserRole, assignedByUserCentro, notes, type, inventoryType } = req.body;
    const assignment = assignmentService.assignCycle(centro || '1300', {
      assignedToUserId,
      assignedToUserName,
      assignedToUserLogin,
      assignedByUserName,
      assignedByUserRole,
      assignedByUserCentro,
      notes,
      inventoryType: type || inventoryType || 'ciclico'
    });
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.post('/api/assignments/conclude', async (req, res) => {
  try {
    const { centro, signatureBase64, operatorName, operatorRole, notes, summary, type, inventoryType } = req.body;
    const result = await assignmentService.concludeAndSignCycle(centro || '1300', {
      signatureBase64,
      operatorName,
      operatorRole,
      notes,
      summary,
      inventoryType: type || inventoryType || 'ciclico'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignments/reopen', async (req, res) => {
  try {
    const { cycleId, centro, adminUsername, adminPassword, reopenReason, requestedBy } = req.body;

    if (!cycleId) {
      return res.status(400).json({ success: false, error: 'ID de ciclo es requerido para la reapertura.' });
    }

    // Validate Administrator credentials
    const authCheck = assignmentService.authorizeAdmin(adminUsername, adminPassword);
    if (!authCheck.authorized) {
      return res.status(403).json({
        success: false,
        error: authCheck.reason || 'Autorización denegada: Se requieren credenciales válidas de Administrador / Encargado.'
      });
    }

    const result = await assignmentService.reopenCycle(centro || '1300', cycleId, {
      authorizedBy: authCheck.user.nombre || authCheck.user.usuario,
      adminUserId: authCheck.user.id,
      reopenReason: reopenReason || 'Reapertura para actualización autorizada'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Error reopening cycle:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/assignments/delete', async (req, res) => {
  try {
    const { cycleId, centro, username, password } = req.body;
    if (!cycleId) {
      return res.status(400).json({ success: false, error: 'ID del ciclo es requerido para eliminar.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Debes ingresar tu contraseña para confirmar la eliminación.' });
    }

    const result = await assignmentService.deleteCycle(centro || '1300', cycleId, {
      username: username || '',
      password: password || ''
    });

    res.json(result);
  } catch (err) {
    console.error('Error deleting cycle:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 1. Configuration & File Inspection
app.get('/api/config', (req, res) => {
  const config = configService.getConfig();
  const fileExists = fs.existsSync(config.activeFilePath);
  res.json({
    ...config,
    fileName: path.basename(config.activeFilePath),
    fileExists,
    localIp: getLocalIp(),
    port: PORT
  });
});

app.post('/api/config', (req, res) => {
  try {
    const updated = configService.saveConfig(req.body);
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/inspect-file', async (req, res) => {
  try {
    const { filePath } = req.body;
    const targetPath = filePath || configService.getConfig().activeFilePath;
    const info = await excelService.inspectWorkbook(targetPath);
    res.json(info);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/config/upload-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se envió ningún archivo.' });
    }

    const uploadedPath = req.file.path;
    const info = await excelService.inspectWorkbook(uploadedPath);
    
    const firstSheet = info.sheets[0];
    const newConfig = {
      activeFilePath: uploadedPath,
      activeSheetName: firstSheet ? firstSheet.name : '1300',
      columnMapping: firstSheet ? firstSheet.suggestedMapping : configService.getConfig().columnMapping
    };
    configService.saveConfig(newConfig);

    res.json({
      success: true,
      message: 'Archivo cargado con éxito',
      fileInfo: info,
      config: newConfig
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/create-sample', async (req, res) => {
  try {
    const samplePath = path.join(__dirname, 'data', `CICLICOS NIBOL MULTIMARCAS.xlsx`);
    await excelService.createSampleInventoryExcel(samplePath);
    const updatedConfig = configService.saveConfig({
      activeFilePath: samplePath,
      activeSheetName: '1300'
    });
    res.json({
      success: true,
      message: 'Plantilla multicentro creada y activada correctamente.',
      config: updatedConfig
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1.1 Google Sheets Remote Integration
app.post('/api/googlesheet/test', async (req, res) => {
  try {
    const { url, type, inventoryType } = req.body || {};
    const t = type || inventoryType;
    const testUrl = url || (t ? configService.getUrlForType(t) : configService.getConfig().googleSheetUrl);
    if (!testUrl) {
      return res.status(400).json({ success: false, error: 'Por favor ingresa la URL de Google Apps Script' });
    }
    const result = await googleSheetService.ping(testUrl);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/googlesheet/sheets', async (req, res) => {
  try {
    const { url, type, inventoryType } = req.body || {};
    const t = type || inventoryType;
    const targetUrl = url || (t ? configService.getUrlForType(t) : configService.getConfig().googleSheetUrl);
    const result = await googleSheetService.getSheets(targetUrl);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2. Inventory Items & Operations (Scoped by Centro Sheet and Access Control)
app.get('/api/inventory', async (req, res) => {
  try {
    const config = configService.getConfig();
    const { search, location, category, abcClass, status, centro, userId, userCargo, userName, userLogin, userCentro, type, inventoryType } = req.query;

    let targetCentro = centro || '1300';
    const roleUpper = String(userCargo || '').toUpperCase();
    const uCentroClean = String(userCentro || '').trim();

    // Strict Centro Scoping: Encargados & Auxiliares can ONLY access their own centro
    if ((roleUpper === 'ENCARGADO' || roleUpper === 'AUXILIAR') && uCentroClean && uCentroClean !== 'TODOS') {
      targetCentro = uCentroClean;
    }

    const t = type || inventoryType || 'ciclico';
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);

    // Access Control check: Encargados always see, Auxiliares only if assigned for cyclics, Barrido is open for active counting
    const isBarrido = (t === 'barrido');
    const permission = isBarrido
      ? { allowed: true }
      : assignmentService.checkPermission(targetCentro, {
          id: userId,
          cargo: userCargo,
          nombre: userName,
          usuario: userLogin || userName,
          centro: targetCentro
        }, t);

    if (!permission.allowed && !isBarrido) {
      return res.json({
        allowed: false,
        reason: permission.reason,
        assignment: permission.assignment,
        totalCount: 0,
        filteredCount: 0,
        sheetName: targetCentro,
        centro: targetCentro,
        inventoryType: t,
        locations: [],
        categories: [],
        blindCount: config.blindCount,
        syncMode: config.syncMode,
        items: []
      });
    }

    let data;
    const isGoogleSheets = Boolean(targetUrl && config.syncMode === 'google_sheets');

    if (isGoogleSheets) {
      try {
        const gsData = await googleSheetService.getInventory(targetUrl, targetCentro);
        if (gsData && gsData.success) {
          data = {
            totalItems: gsData.totalItems || (gsData.items ? gsData.items.length : 0),
            items: gsData.items || [],
            sheetName: gsData.sheetName || targetCentro,
            centro: gsData.centro || targetCentro
          };
        } else {
          throw new Error(gsData?.error || 'Error al obtener datos de Google Sheets');
        }
      } catch (gsErr) {
        console.warn(`Aviso (${t}): Fallback a Excel local:`, gsErr.message);
        data = await excelService.readInventory(
          filePath,
          config.activeSheetName,
          config.columnMapping,
          targetCentro
        );
      }
    } else {
      data = await excelService.readInventory(
        filePath,
        config.activeSheetName,
        config.columnMapping,
        targetCentro
      );
    }

    let items = data.items || [];

    // Apply Filters
    if (search) {
      const q = search.toLowerCase().trim();
      const qClean = q.replace(/^jd[_-]?/i, '');
      items = items.filter(i => {
        const skuLower = (i.sku || '').toLowerCase();
        const barcodeLower = (i.barcode || '').toLowerCase();
        const skuClean = skuLower.replace(/^jd[_-]?/i, '');
        const barcodeClean = barcodeLower.replace(/^jd[_-]?/i, '');

        return (
          skuLower.includes(q) ||
          barcodeLower.includes(q) ||
          (qClean && (skuClean.includes(qClean) || barcodeClean.includes(qClean) || skuLower.includes(qClean) || barcodeLower.includes(qClean))) ||
          (i.description && i.description.toLowerCase().includes(q)) ||
          (i.location && i.location.toLowerCase().includes(q))
        );
      });
    }

    if (location) {
      items = items.filter(i => (i.location || '').toLowerCase() === location.toLowerCase());
    }

    if (category) {
      items = items.filter(i => (i.category || '').toLowerCase() === category.toLowerCase());
    }

    if (abcClass) {
      items = items.filter(i => (i.abcClass || '').toUpperCase() === abcClass.toUpperCase());
    }

    if (status) {
      items = items.filter(i => (i.status || '').toLowerCase() === status.toLowerCase());
    }

    const allLocations = [...new Set((data.items || []).map(i => i.location).filter(Boolean))].sort();
    const allCategories = [...new Set((data.items || []).map(i => i.category).filter(Boolean))].sort();

    res.json({
      allowed: true,
      assignment: permission.assignment,
      totalCount: data.totalItems || items.length,
      filteredCount: items.length,
      sheetName: data.sheetName,
      centro: data.centro,
      inventoryType: t,
      locations: allLocations,
      categories: allCategories,
      blindCount: config.blindCount,
      syncMode: config.syncMode || 'local',
      items
    });
  } catch (err) {
    console.error('Error fetching inventory:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Register Inventory Count (Direct write to Google Sheets or Excel sheet + Audit logging)
app.post('/api/inventory/count', async (req, res) => {
  try {
    const config = configService.getConfig();
    const {
      sku,
      barcode,
      cleanSku: reqCleanSku,
      physicalStock,
      damagedStock,
      locationsBreakdown,
      locationString,
      damagedPhotos,
      previousStock,
      isModification,
      notes,
      operatorName,
      operatorUser,
      operatorCargo,
      description,
      location,
      unitCost,
      systemStock,
      centro,
      type,
      inventoryType
    } = req.body;

    if (sku === undefined || physicalStock === undefined || physicalStock === null || isNaN(physicalStock)) {
      return res.status(400).json({ error: 'SKU y cantidad contada física son requeridos.' });
    }

    const t = type || inventoryType || 'ciclico';
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);
    const counter = operatorName || config.operatorName || 'Operador Web';
    const isGoogleSheets = Boolean(targetUrl && config.syncMode === 'google_sheets');
    let result;

    // Strict Centro Scoping on Count Registration
    let finalCentro = centro || '1300';
    const opRoleUpper = String(operatorCargo || '').toUpperCase();
    const opCentroClean = String(req.body.operatorCentro || req.body.userCentro || '').trim();
    if ((opRoleUpper === 'ENCARGADO' || opRoleUpper === 'AUXILIAR') && opCentroClean && opCentroClean !== 'TODOS') {
      finalCentro = opCentroClean;
    }

    const countOptions = {
      sku,
      barcode: barcode || reqCleanSku || String(sku).replace(/^JD[_-]?/i, ''),
      cleanSku: reqCleanSku || barcode || String(sku).replace(/^JD[_-]?/i, ''),
      physicalStock: Number(physicalStock),
      damagedStock: Number(damagedStock) || 0,
      locationsBreakdown: locationsBreakdown || [],
      locationString: locationString || location || '',
      damagedPhotos: damagedPhotos || [],
      previousStock,
      isModification,
      counterName: counter,
      centro: finalCentro,
      notes: notes || '',
      unitCost: Number(unitCost) || 0,
      systemStock: Number(systemStock) || 0
    };

    if (isGoogleSheets) {
      result = await googleSheetService.updateItemCount(targetUrl, countOptions);

      // Update local file in background as backup if present
      if (fs.existsSync(filePath)) {
        excelService.updateItemCount(
          filePath,
          config.activeSheetName,
          config.columnMapping,
          countOptions
        ).catch(err => console.warn('Aviso local backup:', err.message));
      }
    } else {
      result = await excelService.updateItemCount(
        filePath,
        config.activeSheetName,
        config.columnMapping,
        countOptions
      );
    }

    const currentSystemStock = Number(systemStock) || (result?.systemStock || 0);
    const currentUnitCost = Number(unitCost) || (result?.unitCost || 0);
    const varianceVal = Number(physicalStock) - currentSystemStock;
    const varianceCostVal = Number((varianceVal * currentUnitCost).toFixed(2));
    let statusText = 'Cuadrado';
    if (varianceVal < 0) statusText = 'Faltante';
    if (varianceVal > 0) statusText = 'Sobrante';

    // Log Audit Entry safely
    let auditEntry = null;
    try {
      auditEntry = auditService.logCountEvent({
        centro: centro || '1300',
        sku,
        description: description || result?.description || '',
        location: locationString || location || result?.location || '',
        systemStock: currentSystemStock,
        physicalStock: Number(physicalStock),
        previousStock: previousStock !== undefined ? Number(previousStock) : null,
        isModification: Boolean(isModification),
        variance: varianceVal,
        unitCost: currentUnitCost,
        varianceCost: varianceCostVal,
        status: statusText,
        counterName: counter,
        counterUser: operatorUser || counter,
        counterRole: operatorCargo || 'AUXILIAR',
        notes
      });
    } catch (auditErr) {
      console.warn('Aviso registrando auditoría:', auditErr.message);
    }

    res.json({
      success: true,
      message: isGoogleSheets
        ? 'Conteo guardado exitosamente en Google Sheets'
        : 'Conteo guardado exitosamente en Excel local',
      updatedItem: {
        sku,
        description: description || result?.description,
        location: locationString || location || result?.location,
        systemStock: currentSystemStock,
        physicalStock: Number(physicalStock),
        damagedStock: Number(damagedStock) || 0,
        variance: varianceVal,
        varianceCost: varianceCostVal,
        lastCountDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
        counterName: counter,
        status: statusText,
        centro: centro || '1300'
      },
      auditEntry
    });
  } catch (err) {
    console.error('Error recording count:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3.00 Get Reference Photo from Google Drive (Nibol/ciclicos/fotosreferencias) or Local Storage
app.get('/api/inventory/reference-photo', async (req, res) => {
  try {
    const { sku, centro = '1300', type = 'barrido', inventoryType } = req.query;
    if (!sku) {
      return res.status(400).json({ success: false, error: 'SKU es requerido' });
    }

    const t = type || inventoryType || 'barrido';
    const targetUrl = configService.getUrlForType(t);
    const cleanSku = String(sku).trim().toUpperCase();
    const strippedSku = cleanSku.replace(/^JD[_-]?/i, '');

    const localRefDir = path.join(storagePath.getUploadsDir(), 'fotosreferencias');
    if (!fs.existsSync(localRefDir)) {
      fs.mkdirSync(localRefDir, { recursive: true });
    }

    // 1. Check local cache first (instant response)
    const files = fs.readdirSync(localRefDir);
    const localMatch = files.find(f => {
      const base = path.basename(f, path.extname(f)).toUpperCase();
      const baseStripped = base.replace(/^JD[_-]?/i, '');
      return base === cleanSku || base === strippedSku || baseStripped === strippedSku || base === ('JD_' + strippedSku);
    });

    if (localMatch) {
      const fullLocalPath = path.join(localRefDir, localMatch);
      const ext = path.extname(localMatch).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
      return res.json({
        success: true,
        found: true,
        source: 'local_cache',
        sku: cleanSku,
        fileName: localMatch,
        relativeUrl: `/uploads/fotosreferencias/${localMatch}`
      });
    }

    // 2. Query Google Drive (Nibol/ciclicos/fotosreferencias)
    if (targetUrl) {
      try {
        const drivePhoto = await googleSheetService.getReferencePhoto(targetUrl, cleanSku);
        if (drivePhoto && drivePhoto.success && drivePhoto.found) {
          let cachedRelativeUrl = null;
          if (drivePhoto.dataUrl) {
            try {
              const base64Data = drivePhoto.dataUrl.replace(/^data:image\/\w+;base64,/, '');
              const buffer = Buffer.from(base64Data, 'base64');
              const cacheFileName = `${cleanSku}.jpg`;
              const cacheFilePath = path.join(localRefDir, cacheFileName);
              fs.writeFileSync(cacheFilePath, buffer);
              cachedRelativeUrl = `/uploads/fotosreferencias/${cacheFileName}`;
            } catch (cErr) {
              console.warn('Aviso guardando caché de foto:', cErr.message);
            }
          }

          return res.json({
            success: true,
            found: true,
            source: 'google_drive',
            folder: 'nibol/ciclicos/fotosreferencias',
            sku: cleanSku,
            relativeUrl: cachedRelativeUrl || drivePhoto.thumbnailUrl || drivePhoto.dataUrl,
            ...drivePhoto
          });
        }
      } catch (gErr) {
        console.warn('Aviso consultando foto en Drive:', gErr.message);
      }
    }

    // Not found
    res.json({
      success: true,
      found: false,
      sku: cleanSku,
      message: 'Foto de referencia no encontrada en nibol/ciclicos/fotosreferencias'
    });
  } catch (err) {
    console.error('Error fetching reference photo:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3.01 Upload Damaged Item Evidence Photo directly to Google Drive (Nibol/fotos/[Fecha_Inicio]/[SKU].jpg)
app.post('/api/inventory/upload-damaged-photo', (req, res) => {
  uploadDamagedPhoto.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo de foto' });
    }

    try {
      const { centro = '1300', sku = 'SKU', date, sessionDate, type, inventoryType, operatorCargo, operatorCentro } = req.body;
      let targetCentro = centro || '1300';
      const opRole = String(operatorCargo || '').toUpperCase();
      const opC = String(operatorCentro || '').trim();
      if ((opRole === 'ENCARGADO' || opRole === 'AUXILIAR') && opC && opC !== 'TODOS') {
        targetCentro = opC;
      }

      const t = type || inventoryType || 'barrido';
      const sessionDateStr = sessionDate || date || new Date().toISOString().substring(0, 10);
      const dateStr = date || sessionDateStr;
      const config = configService.getConfig();
      const targetUrl = configService.getUrlForType(t);
      let driveResult = null;

      if (targetUrl) {
        try {
          const fileBase64 = fs.readFileSync(req.file.path).toString('base64');
          driveResult = await googleSheetService.uploadDamagedPhoto(targetUrl, {
            centro: targetCentro,
            sku,
            sessionDate: sessionDateStr,
            date: dateStr,
            fileName: `${targetCentro}_${sku}.jpg`,
            fileBase64: `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBase64}`,
            mimeType: req.file.mimetype || 'image/jpeg'
          });
        } catch (driveErr) {
          console.warn('Aviso subiendo foto a Google Drive:', driveErr.message);
        }
      }

      // Eliminar el archivo temporal del computador local para que no quede guardado en disco
      if (fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unErr) {
          console.warn('Aviso limpiando archivo local:', unErr.message);
        }
      }

      const driveUrl = driveResult?.fileUrl || null;
      const folderUrl = driveResult?.folderUrl || null;
      const folderPath = driveResult?.folderPath || `Nibol/fotos/${sessionDateStr}`;

      res.json({
        success: true,
        message: `Foto guardada exitosamente en Google Drive (${folderPath}/${sku}.jpg)`,
        fileName: `${sku}.jpg`,
        relativeUrl: driveUrl || '',
        googleDriveUrl: driveUrl,
        folderUrl: folderUrl,
        folderPath: folderPath
      });
    } catch (saveErr) {
      // Limpiar archivo local en caso de error
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      res.status(500).json({ success: false, error: saveErr.message });
    }
  });
});

// 3.1 Audit & Operator Efficacy Endpoints
app.get('/api/audit/logs', (req, res) => {
  try {
    const { centro, sku, operator, type, limit, userCargo, userCentro } = req.query;
    const requestingUser = { cargo: userCargo, centro: userCentro };
    const logs = auditService.getAuditLogs({
      centro,
      sku,
      operator,
      type,
      limit: limit ? parseInt(limit, 10) : 100,
      requestingUser
    });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/audit/efficiency', (req, res) => {
  try {
    const { centro, userCargo, userCentro } = req.query;
    const requestingUser = { cargo: userCargo, centro: userCentro };
    const efficiency = auditService.getOperatorEfficiency({
      centro: centro || '1300',
      requestingUser
    });
    res.json({ success: true, ...efficiency });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Reset Cycle Counts for specific Centro
app.post('/api/inventory/reset-cycle', async (req, res) => {
  try {
    const config = configService.getConfig();
    const { location, abcClass, centro, type, inventoryType } = req.body || {};
    const t = type || inventoryType || 'ciclico';
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);
    const isGoogleSheets = Boolean(targetUrl && config.syncMode === 'google_sheets');

    let result;
    if (isGoogleSheets) {
      result = await googleSheetService.resetCycle(
        targetUrl,
        centro || '1300',
        { location, abcClass }
      );
    } else {
      result = await excelService.resetCycle(
        filePath,
        config.activeSheetName,
        config.columnMapping,
        { location, abcClass },
        centro || '1300'
      );
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Analytics & IRA Scoped by Centro + Operator Efficiency + Inventory Type
app.get('/api/analytics', async (req, res) => {
  try {
    const config = configService.getConfig();
    let targetCentro = req.query.centro || '1300';
    if (req.query.userCargo === 'ENCARGADO' && req.query.userCentro && req.query.userCentro !== 'TODOS') {
      targetCentro = req.query.userCentro;
    }
    const t = req.query.type || req.query.inventoryType || 'ciclico';
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);
    const isGoogleSheets = Boolean(targetUrl && config.syncMode === 'google_sheets');

    let analytics;
    if (isGoogleSheets) {
      try {
        analytics = await googleSheetService.getAnalytics(targetUrl, targetCentro);
      } catch (gsErr) {
        console.warn(`Aviso analytics fallback (${t}):`, gsErr.message);
        analytics = await excelService.getAnalytics(
          filePath,
          config.activeSheetName,
          config.columnMapping,
          targetCentro
        );
      }
    } else {
      analytics = await excelService.getAnalytics(
        filePath,
        config.activeSheetName,
        config.columnMapping,
        targetCentro
      );
    }

    // Attach operator efficiency and recount metrics
    const requestingUser = { cargo: req.query.userCargo, centro: req.query.userCentro };
    const operatorEfficiency = auditService.getOperatorEfficiency({
      centro: targetCentro,
      requestingUser
    });

    res.json({
      ...analytics,
      inventoryType: t,
      operatorEfficiency
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.1 Multi-Inventory Types Config Endpoints
app.get('/api/config/types', (req, res) => {
  try {
    const types = configService.getAllInventoryTypes();
    res.json({ success: true, types });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/config/types', (req, res) => {
  try {
    const { googleSheetUrls } = req.body || {};
    const current = configService.getConfig();
    const updated = configService.saveConfig({
      googleSheetUrls: {
        ...current.googleSheetUrls,
        ...(googleSheetUrls || {})
      }
    });
    res.json({ success: true, config: updated, types: configService.getAllInventoryTypes() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Download current Excel directly with date in filename (or generate reviewed/barrido Centro standalone workbook)
app.get('/api/download-excel', async (req, res) => {
  try {
    const config = configService.getConfig();
    const centro = req.query.centro || '1300';
    const dateStr = req.query.date || new Date().toISOString().substring(0, 10);
    const isReviewed = req.query.reviewed === 'true';
    const isBarrido = req.query.type === 'barrido';

    // A. Download Standalone Barrido Excel Workbook
    if (isBarrido) {
      const targetUrl = configService.getUrlForType('barrido');
      const filePath = configService.getExcelPathForType('barrido');
      let items = [];

      if (targetUrl && config.syncMode === 'google_sheets') {
        try {
          const gsData = await googleSheetService.getInventory(targetUrl, centro);
          if (gsData && gsData.items) items = gsData.items;
        } catch (e) {
          console.warn('Aviso obteniendo datos de Sheets para descarga Barrido:', e.message);
        }
      }

      if (items.length === 0 && fs.existsSync(filePath)) {
        try {
          const locData = await excelService.readInventory(filePath, centro, config.columnMapping, centro);
          if (locData && locData.items) items = locData.items;
        } catch (e) {
          console.warn('Aviso leyendo Excel local para descarga Barrido:', e.message);
        }
      }

      const auditEntries = auditService.getAuditLogs({ centro, limit: 1000 }) || [];
      const barridoFileName = `BARRIDO_NIBOL_CENTRO_${centro}_${dateStr}.xlsx`;
      const workbook = await excelService.generateBarridoCentroWorkbook(
        centro,
        items,
        auditEntries,
        req.query.operatorName || 'Operador',
        req.query.notes || 'Inventario de barrido finalizado y certificado',
        dateStr
      );

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${barridoFileName}"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // B. Download Standalone Reviewed/Justified Workbook
    const fileName = isReviewed ? `${dateStr}_Ciclico_Centro_${centro}_Revisado.xlsx` : `${dateStr}_Ciclico_Centro_${centro}.xlsx`;

    if (isReviewed) {
      const requestingUser = { cargo: 'ADMIN', usuario: 'ADMIN', nombre: 'Administrador' };
      const verificationData = await justificationService.getVerificationItems(centro, requestingUser);
      const auditEntries = auditService.getAuditLogs({ centro, limit: 500 }) || [];
      const workbook = await excelService.generateRevisedCentroWorkbook(
        centro,
        verificationData.items,
        auditEntries,
        'ADMIN',
        'Revisión y justificación oficial finalizada'
      );

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // C. Regular Excel download
    if (!fs.existsSync(config.activeFilePath)) {
      return res.status(404).json({ error: 'El archivo Excel no existe.' });
    }
    res.download(config.activeFilePath, fileName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6.01 Endpoint to Conclude and Finish Barrido Inventory Session
app.post('/api/inventory/finish-barrido', async (req, res) => {
  try {
    const { centro, operatorName, operatorUser, operatorCargo, operatorCentro, notes, summary } = req.body;
    let targetCentro = centro || '1300';
    const opRole = String(operatorCargo || '').toUpperCase();
    const opCentro = String(operatorCentro || '').trim();

    if ((opRole === 'ENCARGADO' || opRole === 'AUXILIAR') && opCentro && opCentro !== 'TODOS') {
      targetCentro = opCentro;
    }

    const t = 'barrido';
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);
    const config = configService.getConfig();
    const isGoogleSheets = Boolean(targetUrl && config.syncMode === 'google_sheets');

    let items = [];
    if (isGoogleSheets) {
      try {
        const gsData = await googleSheetService.getInventory(targetUrl, targetCentro);
        if (gsData && gsData.items) items = gsData.items;
      } catch (gsErr) {
        console.warn('Aviso obteniendo datos de Google Sheets para cierre barrido:', gsErr.message);
      }
    }

    if (items.length === 0 && fs.existsSync(filePath)) {
      try {
        const localData = await excelService.readInventory(filePath, targetCentro, config.columnMapping, targetCentro);
        if (localData && localData.items) items = localData.items;
      } catch (locErr) {
        console.warn('Aviso leyendo Excel local para cierre barrido:', locErr.message);
      }
    }

    const auditEntries = auditService.getAuditLogs({ centro: targetCentro, limit: 1000 }) || [];

    // Conclude session in assignment service
    const concludeRes = await assignmentService.concludeAndSignCycle(targetCentro, {
      operatorName: operatorName || 'Operador',
      operatorRole: operatorCargo || 'ENCARGADO',
      notes: notes || 'Inventario de barrido finalizado exitosamente',
      summary: summary || {},
      inventoryType: 'barrido'
    });

    const dateStr = new Date().toISOString().substring(0, 10);
    const fileName = `BARRIDO_NIBOL_CENTRO_${targetCentro}_${dateStr}.xlsx`;

    res.json({
      success: true,
      message: `Inventario de Barrido del Centro ${targetCentro} finalizado exitosamente.`,
      centro: targetCentro,
      fileName,
      downloadUrl: `/api/download-excel?centro=${encodeURIComponent(targetCentro)}&type=barrido&concluded=true&operatorName=${encodeURIComponent(operatorName || 'Operador')}`,
      assignment: concludeRes
    });
  } catch (err) {
    console.error('Error finalizando barrido:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================
// 7. VERIFICACIÓN FINAL & JUSTIFICACIONES (ADMIN ONLY)
// =============================================================
app.get('/api/justifications', async (req, res) => {
  try {
    const { centro, userCargo, userCentro, userLogin, type, inventoryType } = req.query;
    const requestingUser = { cargo: userCargo, centro: userCentro, usuario: userLogin };
    const t = type || inventoryType || 'ciclico';
    const result = await justificationService.getVerificationItems(centro || '1300', requestingUser, t);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message.includes('denegado') ? 403 : 500).json({ success: false, error: err.message });
  }
});

app.post('/api/justifications/verify-item', async (req, res) => {
  try {
    const {
      centro,
      sku,
      description,
      location,
      unitCost,
      systemStock,
      physicalStock,
      finalVerifiedStock,
      justificationType,
      comments,
      photos,
      userCargo,
      userCentro,
      userLogin,
      userName,
      type,
      inventoryType
    } = req.body;

    const requestingUser = {
      cargo: userCargo,
      centro: userCentro,
      usuario: userLogin,
      nombre: userName || userLogin
    };

    const result = await justificationService.saveItemVerification({
      centro,
      sku,
      description,
      location,
      unitCost,
      systemStock,
      physicalStock,
      finalVerifiedStock,
      justificationType,
      comments,
      photos,
      requestingUser,
      type,
      inventoryType
    });

    res.json(result);
  } catch (err) {
    res.status(err.message.includes('denegado') ? 403 : 500).json({ success: false, error: err.message });
  }
});

app.post('/api/justifications/upload-photo', (req, res) => {
  uploadPhoto.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo de foto' });
    }

    try {
      const centro = req.body.centro || '1300';
      const sku = req.body.sku || 'SKU';
      const type = req.body.type || req.body.inventoryType || 'ciclico';
      const dateStr = new Date().toISOString().substring(0, 10);
      const config = configService.getConfig();
      const targetUrl = configService.getUrlForType(type);
      let driveResult = null;

      if (targetUrl) {
        try {
          const fileBase64 = fs.readFileSync(req.file.path).toString('base64');
          driveResult = await googleSheetService.uploadDamagedPhoto(targetUrl, {
            centro,
            sku,
            date: dateStr,
            fileName: req.file.filename,
            fileBase64: `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBase64}`,
            mimeType: req.file.mimetype || 'image/jpeg'
          });
        } catch (driveErr) {
          console.warn('Aviso subiendo foto a Google Drive:', driveErr.message);
        }
      }

      // Eliminar el archivo temporal del computador local
      if (fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }

      const driveUrl = driveResult?.fileUrl || null;
      const folderUrl = driveResult?.folderUrl || 'https://drive.google.com';

      res.json({
        success: true,
        fileName: req.file.filename,
        relativeUrl: driveUrl || '',
        googleDriveUrl: driveUrl,
        folderName: 'Nibol/ciclicos/fotos',
        googleDriveFolderUrl: folderUrl
      });
    } catch (saveErr) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      res.status(500).json({ success: false, error: saveErr.message });
    }
  });
});

app.delete('/api/justifications/photo', (req, res) => {
  try {
    const { relativeUrl, userCargo } = req.body;
    if (userCargo !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Permiso denegado: Solo administradores pueden eliminar fotos.' });
    }
    if (!relativeUrl || typeof relativeUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'Ruta de archivo requerida' });
    }
    const cleanRel = relativeUrl.replace(/^\/uploads\//, '');
    const fullPath = path.join(uploadsDir, cleanRel);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    res.json({ success: true, message: 'Foto eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/justifications/finish-review', async (req, res) => {
  try {
    const { centro, userCargo, userCentro, userLogin, userName, finalNotes, type, inventoryType } = req.body;
    const requestingUser = {
      cargo: userCargo,
      centro: userCentro,
      usuario: userLogin,
      nombre: userName || userLogin
    };

    const result = await justificationService.finishVerificationReview({
      centro: centro || '1300',
      requestingUser,
      finalNotes,
      type: type || inventoryType || 'ciclico'
    });

    res.json(result);
  } catch (err) {
    res.status(err.message.includes('denegado') ? 403 : 500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Start Server / Export for Serverless (Vercel)
// -------------------------------------------------------------
if (!process.env.VERCEL && require.main === module) {
  initializeApp().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIp();
      console.log(`====================================================`);
      console.log(`🚀 SERVIDOR DE INVENTARIOS CÍCLICOS INICIADO`);
      console.log(`   Acceso en esta PC:  http://localhost:${PORT}`);
      console.log(`   Acceso desde Móvil: http://${localIp}:${PORT}`);
      console.log(`====================================================`);
    });
  }).catch(err => {
    console.error('Error al iniciar el servidor:', err);
  });
} else {
  initializeApp().catch(console.error);
}

module.exports = app;
