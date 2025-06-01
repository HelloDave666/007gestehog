/** 
 * Module de contrôle audio pour l'onglet Rita's Adventure
 * Version améliorée avec meilleure détection du système audio 
 * et suppression des contrôles de lecture visibles
 */

const { EventEmitter } = require('events');

// Émetteur d'événements pour la communication avec d'autres modules
const audioControlEvents = new EventEmitter();

// État du module
let container = null;
let isInitialized = false;
let audioControls = null;
let fileInput = null;
let audioFileStatus = null;

// Réferences vers les éléments d'interface
let audioLoadedInfo = null;

/**
 * Crée les contrôles audio dans le conteneur spécifié
 * @param {HTMLElement} containerElement - Élément conteneur pour les contrôles
 */
function createAudioControls(containerElement) {
  if (!containerElement) {
    console.error('[AudioControls] Conteneur non spécifié');
    return;
  }
  
  container = containerElement;
  
  // Vérifier si les contrôles existent déjà
  if (container.querySelector('.audio-controls-container')) {
    console.warn('[AudioControls] Les contrôles audio existent déjà dans ce conteneur');
    return;
  }
  
  console.log('[AudioControls] Création des contrôles audio');
  
  // Créer le conteneur principal
  audioControls = document.createElement('div');
  audioControls.className = 'audio-controls-container';
  audioControls.style.marginBottom = '20px';
  audioControls.style.padding = '15px';
  audioControls.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
  audioControls.style.borderRadius = '8px';
  audioControls.style.border = '1px solid rgba(0, 0, 0, 0.1)';
  
  // Titre des contrôles
  const title = document.createElement('h3');
  title.textContent = '🎵 Contrôles Audio pour les Exercices';
  title.style.marginTop = '0';
  title.style.marginBottom = '15px';
  title.style.color = '#333';
  audioControls.appendChild(title);
  
  // Description
  const description = document.createElement('p');
  description.textContent = 'Chargez un fichier audio qui sera utilisé comme base pour les exercices interactifs.';
  description.style.marginBottom = '15px';
  description.style.color = '#555';
  audioControls.appendChild(description);
  
  // Section de chargement de fichier
  const fileSection = document.createElement('div');
  fileSection.className = 'file-section';
  fileSection.style.marginBottom = '15px';
  
  // Label pour le fichier
  const fileLabel = document.createElement('label');
  fileLabel.innerHTML = '🎵 Choisir un fichier audio ';
  fileLabel.style.marginRight = '10px';
  fileLabel.style.display = 'inline-block';
  fileLabel.style.verticalAlign = 'middle';
  
  // Input de fichier
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'narrativeAudioFile';
  fileInput.accept = 'audio/*';
  fileInput.style.display = 'none';
  
  // Bouton personnalisé pour le chargement de fichier
  const customButton = document.createElement('button');
  customButton.textContent = 'Choisir un fichier';
  customButton.className = 'btn btn-primary btn-sm';
  customButton.style.marginRight = '10px';
  customButton.onclick = function() {
    fileInput.click();
  };
  
  // Nom de fichier
  const fileNameDisplay = document.createElement('span');
  fileNameDisplay.id = 'fileNameDisplay';
  fileNameDisplay.style.marginLeft = '10px';
  fileNameDisplay.style.color = '#666';
  fileNameDisplay.style.fontStyle = 'italic';
  
  // Ajouter les éléments à la section de fichier
  fileLabel.appendChild(fileInput);
  fileSection.appendChild(fileLabel);
  fileSection.appendChild(customButton);
  fileSection.appendChild(fileNameDisplay);
  audioControls.appendChild(fileSection);
  
  // Section d'options
  const optionsSection = document.createElement('div');
  optionsSection.className = 'options-section';
  optionsSection.style.display = 'flex';
  optionsSection.style.alignItems = 'center';
  optionsSection.style.marginBottom = '15px';
  
  // Checkbox pour la lecture en boucle
  const loopContainer = document.createElement('div');
  loopContainer.style.marginRight = '20px';
  
  const loopCheckbox = document.createElement('input');
  loopCheckbox.type = 'checkbox';
  loopCheckbox.id = 'narrativeLoopCheckbox';
  loopCheckbox.checked = true;
  loopCheckbox.style.marginRight = '5px';
  
  const loopLabel = document.createElement('label');
  loopLabel.htmlFor = 'narrativeLoopCheckbox';
  loopLabel.textContent = 'Mode boucle (recommandé pour les exercices)';
  
  loopContainer.appendChild(loopCheckbox);
  loopContainer.appendChild(loopLabel);
  optionsSection.appendChild(loopContainer);
  
  audioControls.appendChild(optionsSection);
  
  // Section de statut
  const statusSection = document.createElement('div');
  statusSection.className = 'status-section';
  
  // Indicateur de fichier audio chargé
  audioFileStatus = document.createElement('div');
  audioFileStatus.className = 'audio-file-status';
  statusSection.appendChild(audioFileStatus);
  
  // Information sur le fichier audio chargé
  audioLoadedInfo = document.createElement('div');
  audioLoadedInfo.className = 'audio-loaded-info';
  audioLoadedInfo.style.display = 'none';
  audioLoadedInfo.style.marginTop = '10px';
  audioLoadedInfo.style.padding = '8px';
  audioLoadedInfo.style.backgroundColor = 'rgba(39, 174, 96, 0.1)';
  audioLoadedInfo.style.borderLeft = '3px solid #27ae60';
  audioLoadedInfo.style.borderRadius = '3px';
  statusSection.appendChild(audioLoadedInfo);
  
  audioControls.appendChild(statusSection);
  
  // Ajouter au conteneur
  container.insertBefore(audioControls, container.firstChild);
  
  // Configurer les événements
  setupEvents();
  
  // Synchroniser avec le système audio existant
  synchronizeWithAudioSystem();
  
  isInitialized = true;
  audioControlEvents.emit('initialized');
  
  console.log('[AudioControls] Contrôles audio créés');
}

/**
 * Configure les événements pour les contrôles audio
 */
function setupEvents() {
  // Événement de chargement de fichier
  fileInput.addEventListener('change', handleFileSelection);
  
  // Événement de lecture en boucle
  const loopCheckbox = document.getElementById('narrativeLoopCheckbox');
  if (loopCheckbox && window.audioSystem && typeof window.audioSystem.setLoopPlayback === 'function') {
    loopCheckbox.addEventListener('change', (event) => {
      window.audioSystem.setLoopPlayback(event.target.checked);
      console.log(`[AudioControls] Mode boucle ${event.target.checked ? 'activé' : 'désactivé'}`);
    });
  }
}

/**
 * Gère la sélection de fichier audio
 * @param {Event} event - Événement de changement d'input
 */
function handleFileSelection(event) {
  const file = event.target.files[0];
  
  if (!file) return;
  
  // Mettre à jour l'affichage du nom de fichier
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  if (fileNameDisplay) {
    fileNameDisplay.textContent = file.name;
  }
  
  // Charger le fichier dans le système audio
  if (window.audioSystem && typeof window.audioSystem.loadAudioFile === 'function') {
    // Mettre à jour le statut
    updateFileStatus('Chargement en cours...', 'loading');
    
    // Charger le fichier audio
    window.audioSystem.loadAudioFile(file)
      .then(() => {
        console.log('[AudioControls] Fichier audio chargé avec succès');
      })
      .catch(error => {
        console.error('[AudioControls] Erreur lors du chargement du fichier audio:', error);
        updateFileStatus('Erreur de chargement', 'error');
      });
  } else {
    console.error('[AudioControls] Système audio non disponible');
    updateFileStatus('Système audio non disponible', 'error');
  }
}

/**
 * Met à jour le statut du fichier audio
 * @param {string} message - Message de statut
 * @param {string} type - Type de statut (loading, success, error)
 */
function updateFileStatus(message, type = 'info') {
  if (!audioFileStatus) return;
  
  // Définir la couleur en fonction du type
  let color = '#333';
  let icon = '📝';
  let backgroundColor = 'transparent';
  
  switch (type) {
    case 'loading':
      color = '#3498db';
      icon = '⏳';
      backgroundColor = 'rgba(52, 152, 219, 0.1)';
      break;
    case 'success':
      color = '#27ae60';
      icon = '✅';
      backgroundColor = 'rgba(39, 174, 96, 0.1)';
      break;
    case 'error':
      color = '#e74c3c';
      icon = '❌';
      backgroundColor = 'rgba(231, 76, 60, 0.1)';
      break;
  }
  
  // Mettre à jour le style et le contenu
  audioFileStatus.style.color = color;
  audioFileStatus.style.padding = '8px';
  audioFileStatus.style.borderRadius = '4px';
  audioFileStatus.style.backgroundColor = backgroundColor;
  audioFileStatus.innerHTML = `${icon} ${message}`;
}

/**
 * Synchronise avec le système audio existant
 */
function synchronizeWithAudioSystem() {
  if (!window.audioSystem) {
    console.warn('[AudioControls] Système audio non disponible pour synchronisation');
    return;
  }
  
  console.log('[AudioControls] Synchronisation avec le système audio');
  
  // Écouter les événements du système audio
  if (window.audioSystem.audioEvents) {
    // Événement de chargement de fichier audio
    window.audioSystem.audioEvents.on('audioFileLoaded', handleAudioFileLoaded);
  }
  
  // Initialiser l'état du mode boucle
  const loopCheckbox = document.getElementById('narrativeLoopCheckbox');
  if (loopCheckbox) {
    // Définir l'état par défaut à "true" pour la boucle
    loopCheckbox.checked = true;
    
    // Appliquer le réglage au système audio
    if (typeof window.audioSystem.setLoopPlayback === 'function') {
      window.audioSystem.setLoopPlayback(true);
    }
  }
}

/**
 * Gère l'événement de chargement de fichier audio
 * @param {object} data - Données du fichier audio chargé
 */
function handleAudioFileLoaded(data) {
  console.log('[AudioControls] Fichier audio chargé:', data.fileName);
  
  // Mettre à jour le statut
  updateFileStatus('Fichier audio chargé avec succès', 'success');
  
  // Mettre à jour les informations de fichier
  if (audioLoadedInfo) {
    audioLoadedInfo.style.display = 'block';
    audioLoadedInfo.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">✓ ${data.fileName} chargé (${data.duration.toFixed(2)}s)</div>
      <div style="font-size: 0.9em; color: #555;">✓ Système audio détecté</div>
    `;
  }
  
  // Émettre un événement
  audioControlEvents.emit('audioFileLoaded', data);
}

/**
 * Vérifie si les contrôles audio sont initialisés
 * @returns {boolean} - Vrai si les contrôles sont initialisés
 */
function isAudioControlsInitialized() {
  return isInitialized;
}

// Exporter les fonctions et l'émetteur d'événements
module.exports = {
  createAudioControls,
  synchronizeWithAudioSystem,
  isAudioControlsInitialized,
  audioControlEvents
};