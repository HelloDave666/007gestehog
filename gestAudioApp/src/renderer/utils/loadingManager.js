// src/renderer/utils/loadingManager.js
const { EventEmitter } = require('events');

// Émetteur d'événements pour le chargement
const loadingEvents = new EventEmitter();

// État du chargement
let loadingProgress = 0;
let totalModules = 3;
let loadedModules = 0;

/**
 * Crée et affiche un écran de chargement simplifié
 */
function createLoadingScreen(container) {
  if (!container) {
    console.error('[Loader] Conteneur pour l\'écran de chargement non spécifié');
    return false;
  }

  console.log('[Loader] Création de l\'écran de chargement simplifié');
  
  // Créer un écran de chargement basique pour tester
  const loadingScreen = document.createElement('div');
  loadingScreen.className = 'loading-screen basic';
  loadingScreen.style.position = 'fixed';
  loadingScreen.style.top = '0';
  loadingScreen.style.left = '0';
  loadingScreen.style.width = '100%';
  loadingScreen.style.height = '100%';
  loadingScreen.style.backgroundColor = '#1a1a2e';
  loadingScreen.style.display = 'flex';
  loadingScreen.style.flexDirection = 'column';
  loadingScreen.style.justifyContent = 'center';
  loadingScreen.style.alignItems = 'center';
  loadingScreen.style.zIndex = '9999';
  
  // Texte de chargement
  const loadingText = document.createElement('div');
  loadingText.textContent = 'Chargement...';
  loadingText.style.color = 'white';
  loadingText.style.fontSize = '24px';
  loadingText.style.marginBottom = '20px';
  
  // Barre de progression
  const progressContainer = document.createElement('div');
  progressContainer.style.width = '300px';
  progressContainer.style.height = '20px';
  progressContainer.style.backgroundColor = '#333';
  progressContainer.style.borderRadius = '10px';
  progressContainer.style.overflow = 'hidden';
  
  const progressBar = document.createElement('div');
  progressBar.style.width = '0%';
  progressBar.style.height = '100%';
  progressBar.style.backgroundColor = '#3498db';
  progressBar.style.transition = 'width 0.3s';
  
  // Assembler les éléments
  progressContainer.appendChild(progressBar);
  loadingScreen.appendChild(loadingText);
  loadingScreen.appendChild(progressContainer);
  
  // Ajouter à la page
  container.appendChild(loadingScreen);
  
  // Garder une référence
  loadingScreen.progressBar = progressBar;
  loadingScreen.loadingText = loadingText;
  window.loadingScreen = loadingScreen;
  
  console.log('[Loader] Écran de chargement créé avec succès');
  return true;
}

/**
 * Met à jour la progression du chargement
 */
function updateLoadingProgress(moduleName) {
  console.log(`[Loader] Mise à jour de la progression: ${moduleName}`);
  loadedModules++;
  loadingProgress = Math.min(100, Math.floor((loadedModules / totalModules) * 100));
  
  const loadingScreen = window.loadingScreen;
  if (loadingScreen && loadingScreen.progressBar) {
    loadingScreen.progressBar.style.width = `${loadingProgress}%`;
  }
  
  if (loadingScreen && loadingScreen.loadingText) {
    loadingScreen.loadingText.textContent = `Chargement de ${moduleName}... (${loadingProgress}%)`;
  }
  
  console.log(`[Loader] Progression: ${loadingProgress}%`);
  
  // Si tout est chargé, émettre un événement
  if (loadedModules >= totalModules) {
    console.log('[Loader] Chargement complet, émission de l\'événement');
    loadingEvents.emit('loadingComplete');
  }
}

/**
 * Ferme l'écran de chargement
 */
function hideLoadingScreen() {
  console.log('[Loader] Tentative de fermeture de l\'écran de chargement');
  const loadingScreen = window.loadingScreen;
  if (loadingScreen) {
    // Simpler fade out
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 1s';
    
    setTimeout(() => {
      if (loadingScreen.parentNode) {
        loadingScreen.parentNode.removeChild(loadingScreen);
        console.log('[Loader] Écran de chargement supprimé');
      }
      window.loadingScreen = null;
      loadingEvents.emit('screenRemoved');
    }, 1000);
  } else {
    console.log('[Loader] Aucun écran de chargement trouvé à fermer');
  }
}

// Exporter le module
module.exports = {
  createLoadingScreen,
  updateLoadingProgress,
  hideLoadingScreen,
  loadingEvents
};