// main.js - version modifiée
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Désactiver l'accélération GPU pour éviter les crashes
app.disableHardwareAcceleration();

// Garder une référence globale de l'objet fenêtre
let mainWindow;

function createWindow() {
  // Créer la fenêtre du navigateur avec des options plus sûres
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    // Toujours montrer la fenêtre pour éviter les problèmes d'affichage
    show: true,
    // Garde le frame pour le moment pour faciliter le débogage
    frame: true
  });

  // Charger le fichier index.html de l'application
  mainWindow.loadFile('index.html');
  
  // Pour le débogage, ouvrir les DevTools
  mainWindow.webContents.openDevTools();

  // Limiter le mode plein écran à une fonction que l'utilisateur peut activer manuellement
  mainWindow.on('ready-to-show', () => {
    console.log('Fenêtre prête à être affichée');
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Cette méthode sera appelée quand Electron aura fini de s'initialiser
app.whenReady().then(() => {
  console.log('Application prête, création de la fenêtre...');
  createWindow();
});

// Quitter lorsque toutes les fenêtres sont fermées
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Gérer la commande de fermeture de l'application
ipcMain.on('quit-app', () => {
  app.quit();
});

// Gérer les journaux de l'interface utilisateur
ipcMain.on('log', (event, data) => {
  console.log(`[Renderer/${data.level}] ${data.message}`);
});