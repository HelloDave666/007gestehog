const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// Remplacer electron-is-dev par une implémentation simple
const isDev = process.env.NODE_ENV === 'development' || 
              process.defaultApp || 
              /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || 
              /[\\/]electron[\\/]/.test(process.execPath);

// Optimisations de mémoire et de performance
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('--no-sandbox');
app.commandLine.appendSwitch('--disable-gpu-vsync');
app.commandLine.appendSwitch('--ignore-gpu-blacklist');

// Désactiver les avertissements de sécurité
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

// Garder une référence globale pour éviter que la fenêtre soit fermée automatiquement
let mainWindow

// Configuration du chemin pour les modules natifs (noble) sur Windows
if (process.platform === 'win32') {
  // En mode production, les ressources sont dans un dossier spécifique
  if (!isDev) {
    process.env.PATH = process.env.PATH + ';' + path.join(process.resourcesPath, 'build', 'Release')
  }
}

// Créer un fichier de log dans le dossier de l'application
const logPath = path.join(app.getPath('userData'), 'app.log');

// Fonction de log qui écrit dans le fichier et console
function log(level, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  
  // Écrire dans la console
  console.log(logMessage);
  
  // Écrire dans le fichier
  try {
    fs.appendFileSync(logPath, logMessage);
  } catch (e) {
    console.error('Impossible d\'écrire dans le fichier de log:', e);
  }
}

// Réinitialiser le fichier de log au démarrage
try {
  fs.writeFileSync(logPath, `=== Démarrage de l'application: ${new Date().toISOString()} ===\n`);
  log('INFO', 'Fichier de log initialisé');
} catch (e) {
  console.error('Impossible de créer le fichier de log:', e);
}

function createWindow() {
  // Créer la fenêtre du navigateur avec configuration optimisée
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      backgroundThrottling: false, // Évite le ralentissement en arrière-plan
      webSecurity: false // Désactive certaines restrictions pour le développement
    },
    icon: path.join(__dirname, 'build/icon.png'),
    title: "Heart Of Glass",
    backgroundColor: '#f5f5f5',
    show: false // Ne pas afficher la fenêtre jusqu'à ce qu'elle soit prête
  })

  // Afficher la fenêtre quand elle est prête pour éviter les flashs blancs
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log('INFO', 'Fenêtre principale affichée');
  });

  // Charger le fichier index.html de l'application
  mainWindow.loadFile('index.html')

  // En mode développement, nous n'ouvrons PAS les DevTools mais nous pouvons
  // afficher des informations de débogage dans la fenêtre elle-même
  if (isDev) {
    log('INFO', 'Application en mode développement (sans DevTools)');
    
    // IPC pour recevoir les logs du renderer
    ipcMain.on('log', (event, data) => {
      log(data.level || 'INFO', data.message);
    });
  }

  // Gérer la fermeture de la fenêtre
  mainWindow.on('closed', function() {
    mainWindow = null;
    log('INFO', 'Fenêtre principale fermée');
  });
  
  // Optimisation de la mémoire
  setInterval(() => {
    if (global.gc) {
      try {
        global.gc();
        log('DEBUG', 'Garbage collection manuelle exécutée');
      } catch (e) {
        // Ignorer les erreurs
      }
    }
  }, 60000); // Toutes les 60 secondes
}

// Cette méthode sera appelée quand Electron a fini de s'initialiser
app.whenReady().then(() => {
  createWindow();
  
  // Afficher les informations système pour le débogage
  log('INFO', `Electron Version: ${process.versions.electron}`);
  log('INFO', `Chrome Version: ${process.versions.chrome}`);
  log('INFO', `Node Version: ${process.versions.node}`);
  log('INFO', `Platform: ${process.platform}`);
  log('INFO', `Architecture: ${process.arch}`);
  log('INFO', `Chemin de l'application: ${app.getAppPath()}`);
  log('INFO', `Chemin de log: ${logPath}`);
  log('INFO', `Mode développement: ${isDev}`);
});

// Quitter quand toutes les fenêtres sont fermées, sauf sur macOS
app.on('window-all-closed', function() {
  // Sur macOS, il est courant que les applications et leur barre de menu
  // restent actives jusqu'à ce que l'utilisateur quitte explicitement avec Cmd + Q
  if (process.platform !== 'darwin') {
    log('INFO', 'Toutes les fenêtres sont fermées, arrêt de l\'application');
    app.quit();
  }
});

app.on('activate', function() {
  // Sur macOS, il est courant de recréer une fenêtre dans l'application
  // quand l'icône du dock est cliquée et qu'il n'y a pas d'autres fenêtres ouvertes
  if (mainWindow === null) {
    log('INFO', 'Réactivation de l\'application, création d\'une nouvelle fenêtre');
    createWindow();
  }
});

// Gestion des éventuelles exceptions non capturées
process.on('uncaughtException', (error) => {
  log('ERROR', `Exception non capturée: ${error.stack || error}`);
});

// Gestion des promesses rejetées non gérées
process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', `Promesse rejetée non gérée: ${reason}`);
});