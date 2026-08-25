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

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for Excel file uploads
const uploadsDir = storagePath.getUploadsDir();

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
    const newUser = usersService.addUser(req.body);
    res.json({ success: true, user: newUser });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/auth/users/:id', (req, res) => {
  try {
    const updated = usersService.updateUser(req.params.id, req.body);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/auth/users/:id', (req, res) => {
  try {
    const result = usersService.deleteUser(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 0.1 Assignments & Digital Signature
app.get('/api/assignments', (req, res) => {
  try {
    const { centro } = req.query;
    const assignment = assignmentService.getAssignment(centro || '1300');
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignments/assign', (req, res) => {
  try {
    const { centro, assignedToUserId, assignedToUserName, assignedToUserLogin, assignedByUserName, notes } = req.body;
    const assignment = assignmentService.assignCycle(centro || '1300', {
      assignedToUserId,
      assignedToUserName,
      assignedToUserLogin,
      assignedByUserName,
      notes
    });
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignments/conclude', async (req, res) => {
  try {
    const { centro, signatureBase64, operatorName, operatorRole, notes } = req.body;
    const result = await assignmentService.concludeAndSignCycle(centro || '1300', {
      signatureBase64,
      operatorName,
      operatorRole,
      notes
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const { url } = req.body || {};
    const testUrl = url || configService.getConfig().googleSheetUrl;
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
    const { url } = req.body || {};
    const targetUrl = url || configService.getConfig().googleSheetUrl;
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
    const { search, location, category, abcClass, status, centro, userId, userCargo, userName } = req.query;

    const targetCentro = centro || '1300';

    // Access Control check: Encargados always see, Auxiliares only if assigned
    const permission = assignmentService.checkPermission(targetCentro, {
      id: userId,
      cargo: userCargo,
      nombre: userName,
      usuario: userName
    });

    if (!permission.allowed) {
      return res.json({
        allowed: false,
        reason: permission.reason,
        assignment: permission.assignment,
        totalCount: 0,
        filteredCount: 0,
        sheetName: targetCentro,
        centro: targetCentro,
        locations: [],
        categories: [],
        blindCount: config.blindCount,
        syncMode: config.syncMode,
        items: []
      });
    }

    let data;
    const isGoogleSheets = Boolean(config.googleSheetUrl && config.syncMode === 'google_sheets');

    if (isGoogleSheets) {
      try {
        const gsData = await googleSheetService.getInventory(config.googleSheetUrl, targetCentro);
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
        console.warn('Aviso: Fallback a Excel local:', gsErr.message);
        data = await excelService.readInventory(
          config.activeFilePath,
          config.activeSheetName,
          config.columnMapping,
          targetCentro
        );
      }
    } else {
      data = await excelService.readInventory(
        config.activeFilePath,
        config.activeSheetName,
        config.columnMapping,
        targetCentro
      );
    }

    let items = data.items || [];

    // Apply Filters
    if (search) {
      const q = search.toLowerCase().trim();
      items = items.filter(i => 
        (i.sku && i.sku.toLowerCase().includes(q)) || 
        (i.barcode && i.barcode.toLowerCase().includes(q)) || 
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.location && i.location.toLowerCase().includes(q))
      );
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

// 3. Register Inventory Count (Direct write to Google Sheets or Excel sheet)
app.post('/api/inventory/count', async (req, res) => {
  try {
    const config = configService.getConfig();
    const { sku, physicalStock, notes, operatorName, unitCost, systemStock, centro } = req.body;

    if (sku === undefined || physicalStock === undefined || physicalStock === null || isNaN(physicalStock)) {
      return res.status(400).json({ error: 'SKU y cantidad contada física son requeridos.' });
    }

    const counter = operatorName || config.operatorName || 'Operador Web';
    const isGoogleSheets = Boolean(config.googleSheetUrl && config.syncMode === 'google_sheets');
    let result;

    if (isGoogleSheets) {
      result = await googleSheetService.updateItemCount(config.googleSheetUrl, {
        sku,
        physicalStock: Number(physicalStock),
        counterName: counter,
        centro: centro || '1300',
        notes: notes || '',
        unitCost: Number(unitCost) || 0,
        systemStock: Number(systemStock) || 0
      });

      // Update local file in background as backup if present
      if (fs.existsSync(config.activeFilePath)) {
        excelService.updateItemCount(
          config.activeFilePath,
          config.activeSheetName,
          config.columnMapping,
          {
            sku,
            physicalStock: Number(physicalStock),
            counterName: counter,
            centro: centro || '1300',
            notes: notes || '',
            unitCost: Number(unitCost) || 0,
            systemStock: Number(systemStock) || 0
          }
        ).catch(err => console.warn('Aviso local backup:', err.message));
      }
    } else {
      result = await excelService.updateItemCount(
        config.activeFilePath,
        config.activeSheetName,
        config.columnMapping,
        {
          sku,
          physicalStock: Number(physicalStock),
          counterName: counter,
          centro: centro || '1300',
          notes: notes || '',
          unitCost: Number(unitCost) || 0,
          systemStock: Number(systemStock) || 0
        }
      );
    }

    res.json(result);
  } catch (err) {
    console.error('Error recording count:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. Reset Cycle Counts for specific Centro
app.post('/api/inventory/reset-cycle', async (req, res) => {
  try {
    const config = configService.getConfig();
    const { location, abcClass, centro } = req.body || {};
    const isGoogleSheets = Boolean(config.googleSheetUrl && config.syncMode === 'google_sheets');

    let result;
    if (isGoogleSheets) {
      result = await googleSheetService.resetCycle(
        config.googleSheetUrl,
        centro || '1300',
        { location, abcClass }
      );
    } else {
      result = await excelService.resetCycle(
        config.activeFilePath,
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

// 5. Analytics & IRA Scoped by Centro
app.get('/api/analytics', async (req, res) => {
  try {
    const config = configService.getConfig();
    const { centro } = req.query;
    const isGoogleSheets = Boolean(config.googleSheetUrl && config.syncMode === 'google_sheets');

    let analytics;
    if (isGoogleSheets) {
      try {
        analytics = await googleSheetService.getAnalytics(config.googleSheetUrl, centro || '1300');
      } catch (gsErr) {
        console.warn('Aviso analytics fallback:', gsErr.message);
        analytics = await excelService.getAnalytics(
          config.activeFilePath,
          config.activeSheetName,
          config.columnMapping,
          centro || '1300'
        );
      }
    } else {
      analytics = await excelService.getAnalytics(
        config.activeFilePath,
        config.activeSheetName,
        config.columnMapping,
        centro || '1300'
      );
    }

    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Download current Excel directly
app.get('/api/download-excel', (req, res) => {
  try {
    const config = configService.getConfig();
    if (!fs.existsSync(config.activeFilePath)) {
      return res.status(404).json({ error: 'El archivo Excel no existe.' });
    }
    const fileName = path.basename(config.activeFilePath);
    res.download(config.activeFilePath, fileName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Start Server / Export for Serverless (Vercel)
// -------------------------------------------------------------
if (!process.env.VERCEL) {
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
