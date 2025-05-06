const { app, BrowserWindow } = require('electron');
const path = require('path');

// Déterminer si nous sommes en mode développement
const isDev = !app.isPackaged;

// Optimisations pour éviter les plantages en mode développement
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('remote-debugging-port', '9222');
app.commandLine.appendSwitch('disable-http-cache');

// Pour désactiver les avertissements de sécurité
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

// Garder une référence globale pour éviter que la fenêtre soit fermée automatiquement
let mainWindow;

// Configuration du chemin pour les modules natifs (noble) sur Windows
if (process.platform === 'win32') {
  if (!isDev) {
    process.env.PATH = process.env.PATH + ';' + path.join(process.resourcesPath, 'build', 'Release');
  }
}

function createWindow() {
  // Définir une taille légèrement plus petite tout en gardant le ratio 16:9
  const scaleFactor = 0.9; // 90% de la taille originale
  const width = Math.round(1920 * scaleFactor);
  const height = Math.round(1080 * scaleFactor);
  
  // Créer la fenêtre du navigateur avec la taille réduite
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
      backgroundThrottling: false
    },
    icon: path.join(__dirname, '../../build/icon.png'),
    title: "Heart Of Glass",
    backgroundColor: '#FFFFFF', // Fond blanc pour les marges
    show: false,
    resizable: true
  });

  // Charger le fichier index.html de l'application
  mainWindow.loadFile(path.join(__dirname, '../../index.html'));
  
  // Afficher la fenêtre quand elle est prête
  mainWindow.once('ready-to-show', () => {
    // Forcer la taille exacte
    mainWindow.setContentSize(width, height);
    mainWindow.center();
    mainWindow.show();
  });

  // Désactiver les DevTools pour éviter les plantages
  if (isDev && !process.argv.includes('--disable-dev-tools')) {
    // Décommenter cette ligne si vous voulez utiliser les DevTools
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
    console.log('Mode développement - DevTools désactivés pour éviter les plantages');
  }

  // Gérer la fermeture de la fenêtre
  mainWindow.on('closed', function() {
    mainWindow = null;
  });
}

// Cette méthode sera appelée quand Electron a fini de s'initialiser
app.whenReady().then(() => {
  createWindow();
  
  // Afficher les informations système pour le débogage en mode dev
  if (isDev) {
    console.log('Electron Version:', process.versions.electron);
    console.log('Chrome Version:', process.versions.chrome);
    console.log('Node Version:', process.versions.node);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
  }
});

// Quitter quand toutes les fenêtres sont fermées, sauf sur macOS
app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function() {
  if (mainWindow === null) createWindow();
});

// Gestion des éventuelles exceptions non capturées
process.on('uncaughtException', (error) => {
  console.error('Erreur non capturée :', error);
});