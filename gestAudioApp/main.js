const { app, BrowserWindow } = require('electron')
const path = require('path')
const isDev = require('electron-is-dev')

// Garder une référence globale pour éviter que la fenêtre soit fermée automatiquement
// quand l'objet JavaScript est garbage collected
let mainWindow

// Configuration du chemin pour les modules natifs (noble) sur Windows
if (process.platform === 'win32') {
  // En mode production, les ressources sont dans un dossier spécifique
  if (!isDev) {
    process.env.PATH = process.env.PATH + ';' + path.join(process.resourcesPath, 'build', 'Release')
  }
}

function createWindow() {
  // Créer la fenêtre du navigateur
  mainWindow = new BrowserWindow({
    width: 1000, // Taille légèrement plus grande pour une meilleure visibilité
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true // Nécessaire pour certaines fonctionnalités
    },
    icon: path.join(__dirname, 'build/icon.png'), // Icône de l'application
    title: "Gestion Audio BLE", // Titre de la fenêtre
    backgroundColor: '#f5f5f5' // Couleur de fond pendant le chargement
  })

  // Charger le fichier index.html de l'application
  mainWindow.loadFile('index.html')

  // Ouvrir les outils de développement uniquement en mode développement
  if (isDev) {
    mainWindow.webContents.openDevTools()
    console.log('Mode développement - DevTools activé')
  }

  // Gérer la fermeture de la fenêtre
  mainWindow.on('closed', function() {
    mainWindow = null
  })
}

// Cette méthode sera appelée quand Electron a fini de s'initialiser
app.whenReady().then(() => {
  createWindow()
  
  // Afficher les informations système pour le débogage en mode dev
  if (isDev) {
    console.log('Electron Version:', process.versions.electron)
    console.log('Chrome Version:', process.versions.chrome)
    console.log('Node Version:', process.versions.node)
    console.log('Platform:', process.platform)
    console.log('Architecture:', process.arch)
  }
})

// Quitter quand toutes les fenêtres sont fermées, sauf sur macOS
app.on('window-all-closed', function() {
  // Sur macOS, il est courant que les applications et leur barre de menu
  // restent actives jusqu'à ce que l'utilisateur quitte explicitement avec Cmd + Q
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function() {
  // Sur macOS, il est courant de recréer une fenêtre dans l'application
  // quand l'icône du dock est cliquée et qu'il n'y a pas d'autres fenêtres ouvertes
  if (mainWindow === null) createWindow()
})

// Gestion des éventuelles exceptions non capturées
process.on('uncaughtException', (error) => {
  console.error('Erreur non capturée :', error)
})