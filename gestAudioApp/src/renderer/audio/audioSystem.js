/**
 * Système audio principal
 * Coordonne les fonctionnalités audio et l'interface utilisateur
 */

const { initGrainPlayer, setAudioBuffer, startPlayback, 
  stopPlayback, isPlaybackActive, setPlaybackRate,
  setPlayDirection, setVolume, updateConfig,
  getPlaybackPosition, setPlaybackPosition } = require('./grainPlayer');
const { optimizeMemoryUsage, cleanupAudioResources } = require('./memoryManager');
const { EventEmitter } = require('events');
const { initRecorder, startRecording, stopRecording, 
        saveRecording, isRecordingActive, 
        getRecordingDuration, recorderEvents } = require('./recorder');
const path = require('path');

// Créer un émetteur d'événements pour communiquer avec d'autres modules
const audioEvents = new EventEmitter();

// Variables du système audio
let audioContext = null;
let audioBuffer = null;
let timelineUpdateInterval = null;
let isAudioInitialized = false;
let sensitivityFactor = 1.0;

// Référence globale pour l'enregistrement
let audioSource = null;
let mainGainNode = null;

// Fonction pour exposer le nœud source audio principal
window.getAudioSourceNode = function() {
  return audioSource;
};

// Paramètres de la synthèse granulaire (alignés avec l'original)
let grainSize = 0.35;        // 350ms par défaut
let overlap = 0.92;          // 92% de chevauchement (comme l'original)
let windowType = 'hann';     // Type de fenêtre d'apodisation
let loopPlayback = true;     // Lecture en boucle

// Stocker les dernières valeurs
let playbackRate = 1.0;
let playDirection = 1;
let currentVolume = 1.0;

/**
 * Initialise le système audio
 * @returns {boolean} - Succès de l'initialisation
 */
function initAudioSystem() {
  try {
    console.log('[Audio] Initialisation du système audio');

    // Créer le contexte audio
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // S'assurer que le contexte audio est démarré
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('[Audio] Contexte audio démarré avec succès');
      }).catch(err => {
        console.error('[Audio] Erreur lors du démarrage du contexte audio:', err);
      });
    }
    
    // Créer un nœud de gain principal pour tout le système audio
    mainGainNode = audioContext.createGain();
    mainGainNode.gain.value = 1.0;
    mainGainNode.connect(audioContext.destination);
    
    // Conserver une référence pour l'enregistrement
    audioSource = mainGainNode;

    // Initialiser le lecteur de grains avec les paramètres de l'original
    initGrainPlayer(audioContext, {
      grainSize: grainSize,
      overlap: overlap,
      windowType: windowType,
      loopPlayback: loopPlayback,
      maxActiveGrains: 8,    // Comme l'original
      updateRate: 60,        // 60Hz comme l'original
      outputNode: mainGainNode // Connecter au nœud de gain principal au lieu de destination
    });
    
    // Initialiser l'enregistreur
    initRecorder(audioContext);
    
    // Configurer les événements de l'enregistreur
    setupRecorderEvents();

    // Configurer les contrôles utilisateur
    setupAudioControls();

    // Configurer le nettoyage périodique de la mémoire
    setInterval(cleanupAudioResources, 30000);
    setInterval(optimizeMemoryUsage, 120000);

    // Démarrer les mises à jour d'interface
    startInterfaceUpdates();

    isAudioInitialized = true;
    console.log('[Audio] Système audio initialisé avec succès');

    // Notifier les autres modules
    audioEvents.emit('audioSystemInitialized');

    return true;
  } catch (error) {
    console.error('[Audio] Erreur lors de l\'initialisation du système audio:', error);
    return false;
  }
}

/**
 * Configure les contrôles audio dans l'interface
 */
function setupAudioControls() {
  // Contrôles de base
  setupBasicControls();

  // Contrôles avancés
  setupAdvancedControls();

  // Timeline
  setupTimelineControl();

  // Ajouter un gestionnaire pour les interactions utilisateur pour activer l'audio
  document.addEventListener('click', activateAudioContext);
  document.addEventListener('keydown', activateAudioContext);
}

/**
 * Active le contexte audio lors d'une interaction utilisateur
 */
function activateAudioContext() {
  if (audioContext && audioContext.state === 'suspended') {
    console.log('[Audio] Activation du contexte audio par interaction utilisateur');
    audioContext.resume().then(() => {
      console.log('[Audio] Contexte audio activé avec succès');
    });
  }

  // Ne s'exécute qu'une fois
  document.removeEventListener('click', activateAudioContext);
  document.removeEventListener('keydown', activateAudioContext);
}

/**
 * Configure les contrôles audio de base
 */
function setupBasicControls() {
  const audioFileInput = document.getElementById('audioFile');
  const playPauseButton = document.getElementById('playPauseButton');
  const loopCheckbox = document.getElementById('loopCheckbox');

  // Chargement de fichier
  if (audioFileInput) {
    audioFileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        loadAudioFile(file);
      }
    });
  } else {
    console.warn('[Audio] Élément audioFile non trouvé dans le DOM');
  }

  // Lecture/Pause
  if (playPauseButton) {
    playPauseButton.addEventListener('click', togglePlayPause);
  } else {
    console.warn('[Audio] Élément playPauseButton non trouvé dans le DOM');
  }

  // Boucle
  if (loopCheckbox) {
    loopCheckbox.checked = loopPlayback;
    loopCheckbox.addEventListener('change', (event) => {
      loopPlayback = event.target.checked;
      updateConfig({ loopPlayback });
      console.log(`[Audio] Lecture en boucle ${loopPlayback ? 'activée' : 'désactivée'}`);
    });
  } else {
    console.warn('[Audio] Élément loopCheckbox non trouvé dans le DOM');
  }

  // Enregistrement
  const recordButton = document.getElementById('recordButton');
  if (recordButton) {
    recordButton.disabled = false; // Activer le bouton d'enregistrement
    recordButton.addEventListener('click', toggleRecording);
  }
}

/**
 * Configure les contrôles audio avancés
 */
function setupAdvancedControls() {
  const sensitivitySlider = document.getElementById('sensitivitySlider');
  const sensitivityValue = document.getElementById('sensitivityValue');
  const grainSizeInput = document.getElementById('grainSizeInput');
  const overlapInput = document.getElementById('overlapInput');
  const windowTypeSelect = document.getElementById('windowTypeSelect');

  // Sensibilité des capteurs
  if (sensitivitySlider && sensitivityValue) {
    sensitivitySlider.value = sensitivityFactor;
    sensitivityValue.textContent = sensitivityFactor.toFixed(1);

    sensitivitySlider.addEventListener('input', (event) => {
      sensitivityFactor = parseFloat(event.target.value);
      sensitivityValue.textContent = sensitivityFactor.toFixed(1);
      console.log(`[Audio] Sensibilité capteurs: ${sensitivityFactor}`);
    });
  } else {
    console.warn('[Audio] Éléments de sensibilité non trouvés dans le DOM');
  }

  // Taille des grains
  if (grainSizeInput) {
    grainSizeInput.value = Math.round(grainSize * 1000);

    grainSizeInput.addEventListener('change', (event) => {
      const sizeMs = parseInt(event.target.value);
      grainSize = sizeMs / 1000;
      updateConfig({ grainSize });
      console.log(`[Audio] Taille grain: ${sizeMs}ms`);
    });
  }

  // Chevauchement
  if (overlapInput) {
    overlapInput.value = Math.round(overlap * 100);

    overlapInput.addEventListener('change', (event) => {
      const overlapPercent = parseInt(event.target.value);
      overlap = overlapPercent / 100;
      updateConfig({ overlap });
      console.log(`[Audio] Chevauchement: ${overlapPercent}%`);
    });
  }

  // Type de fenêtre
  if (windowTypeSelect) {
    windowTypeSelect.value = windowType;

    windowTypeSelect.addEventListener('change', (event) => {
      windowType = event.target.value;
      updateConfig({ windowType });
      console.log(`[Audio] Type de fenêtre: ${windowType}`);
    });
  }
}

/**
 * Configure les événements de l'enregistreur
 */
function setupRecorderEvents() {
  recorderEvents.on('recordingUpdate', (data) => {
    // Mettre à jour l'affichage de la durée
    const recordingStatus = document.getElementById('recordingStatus');
    if (recordingStatus) {
      const minutes = Math.floor(data.duration / 60);
      const seconds = Math.floor(data.duration % 60);
      recordingStatus.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  });
  
  recorderEvents.on('recordingStopped', (data) => {
    console.log(`[Audio] Enregistrement terminé: ${data.duration.toFixed(1)}s`);
  });
  
  recorderEvents.on('recordingError', (message) => {
    console.error(`[Audio] Erreur d'enregistrement: ${message}`);
    updateAudioStatus(`Erreur: ${message}`);
  });
}

/**
 * Configure la timeline pour le contrôle de position
 */
function setupTimelineControl() {
  const timelineContainer = document.getElementById('timelineContainer');

  if (timelineContainer) {
    timelineContainer.addEventListener('click', (event) => {
      if (!audioBuffer) return;

      const rect = timelineContainer.getBoundingClientRect();
      const position = (event.clientX - rect.left) / rect.width;
      const targetPosition = position * audioBuffer.duration;

      setPlaybackPosition(targetPosition);
      updatePlaybackDisplay();

      console.log(`[Audio] Position changée: ${targetPosition.toFixed(2)}s`);
    });
  } else {
    console.warn('[Audio] Élément timelineContainer non trouvé dans le DOM');
  }
}

/**
 * Démarre les mises à jour périodiques de l'interface
 */
function startInterfaceUpdates() {
  // Arrêter l'intervalle existant si présent
  if (timelineUpdateInterval) {
    clearInterval(timelineUpdateInterval);
  }

  // Démarrer les mises à jour d'interface
  timelineUpdateInterval = setInterval(() => {
    if (isPlaybackActive()) {
      updatePlaybackDisplay();
    }
  }, 100);
}

/**
 * Charge un fichier audio
 * @param {File} file - Fichier audio à charger
 * @returns {Promise<boolean>} - Succès du chargement
 */
async function loadAudioFile(file) {
  if (!audioContext) {
    console.error('[Audio] Contexte audio non initialisé');
    return false;
  }

  try {
    console.log(`[Audio] Chargement du fichier: ${file.name}`);

    // Nettoyer la mémoire avant de charger un nouveau fichier
    cleanupAudioResources();

    // Arrêter la lecture si en cours
    if (isPlaybackActive()) {
      togglePlayPause();
    }

    // Mettre à jour le statut
    updateAudioStatus('Chargement...');

    // Lire le fichier
    const arrayBuffer = await readFileAsArrayBuffer(file);

    // S'assurer que le contexte audio est démarré
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Décoder l'audio
    const decodedBuffer = await decodeAudioData(arrayBuffer);

    // Stocker le buffer
    audioBuffer = decodedBuffer;

    // Définir le buffer pour le lecteur
    setAudioBuffer(decodedBuffer);

    // Activer le bouton d'enregistrement
    const recordButton = document.getElementById('recordButton');
    if (recordButton) {
      recordButton.disabled = false;
    }

    // Mettre à jour l'interface
    updatePlaybackDisplay();
    updateAudioStatus('Prêt à lire');

    console.log(`[Audio] Fichier audio chargé: ${file.name}, durée: ${decodedBuffer.duration.toFixed(2)}s`);

    // Notifier les autres modules
    audioEvents.emit('audioFileLoaded', { 
      fileName: file.name,
      duration: decodedBuffer.duration,
      sampleRate: decodedBuffer.sampleRate,
      numberOfChannels: decodedBuffer.numberOfChannels
    });

    return true;
  } catch (error) {
    console.error('[Audio] Erreur lors du chargement du fichier audio:', error);
    updateAudioStatus('Erreur de chargement');
    return false;
  }
}

/**
 * Lit un fichier en tant que ArrayBuffer
 * @param {File} file - Fichier à lire
 * @returns {Promise<ArrayBuffer>} - Contenu du fichier
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = (error) => reject(error);

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Décode les données audio
 * @param {ArrayBuffer} arrayBuffer - Données audio à décoder
 * @returns {Promise<AudioBuffer>} - Buffer audio décodé
 */
function decodeAudioData(arrayBuffer) {
  return new Promise((resolve, reject) => {
    // Utiliser un timeout pour éviter les blocages indéfinis
    const timeoutId = setTimeout(() => {
      reject(new Error('Décodage audio : timeout dépassé'));
    }, 30000);

    audioContext.decodeAudioData(
      arrayBuffer,
      (buffer) => {
        clearTimeout(timeoutId);
        resolve(buffer);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

/**
 * Bascule entre lecture et pause
 */
function togglePlayPause() {
  if (!audioBuffer) {
    updateAudioStatus('Aucun fichier audio chargé');
    return;
  }

  const playPauseButton = document.getElementById('playPauseButton');
  const playIcon = playPauseButton?.querySelector('.play-icon-fa');
  const pauseIcon = playPauseButton?.querySelector('.pause-icon-fa');

  if (isPlaybackActive()) {
    // Arrêter la lecture
    stopPlayback();

    // Mettre à jour l'interface
    if (playIcon && pauseIcon) {
      playIcon.style.display = '';
      pauseIcon.style.display = 'none';
    }

    updateAudioStatus('En pause');
  } else {
    // S'assurer que le contexte audio est actif
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Démarrer la lecture
    if (startPlayback()) {
      // Mettre à jour l'interface
      if (playIcon && pauseIcon) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = '';
      }

      updateAudioStatus('Lecture en cours');
    } else {
      updateAudioStatus('Erreur de lecture');
    }
  }
}

/**
 * Bascule l'état d'enregistrement
 */
function toggleRecording() {
  const recordButton = document.getElementById('recordButton');
  const recordingStatus = document.getElementById('recordingStatus');
  
  if (isRecordingActive()) {
    // Arrêter l'enregistrement
    stopRecording();
    
    // Mettre à jour l'interface
    if (recordButton) {
      recordButton.classList.remove('recording');
      recordButton.innerHTML = '<i class="fas fa-microphone"></i> Enregistrer';
    }
    
    if (recordingStatus) {
      recordingStatus.style.display = 'none';
    }
    
    updateAudioStatus('Enregistrement terminé');
    
    // Demander la sauvegarde
    saveRecordingDialog();
  } else {
    // Démarrer l'enregistrement
    if (startRecording()) {
      // Mettre à jour l'interface
      if (recordButton) {
        recordButton.classList.add('recording');
        recordButton.innerHTML = '<i class="fas fa-stop"></i> Arrêter';
      }
      
      // Créer ou afficher l'élément pour la durée
      if (!recordingStatus) {
        const newRecordingStatus = document.createElement('div');
        newRecordingStatus.id = 'recordingStatus';
        newRecordingStatus.className = 'recording-status';
        newRecordingStatus.textContent = '00:00';
        
        // Ajouter près du bouton d'enregistrement
        const controlsContainer = recordButton.parentElement;
        if (controlsContainer) {
          controlsContainer.appendChild(newRecordingStatus);
        }
      } else {
        recordingStatus.textContent = '00:00';
        recordingStatus.style.display = 'inline-block';
      }
      
      updateAudioStatus('Enregistrement en cours...');
    } else {
      updateAudioStatus('Erreur d\'enregistrement');
    }
  }
}

/**
 * Affiche un dialogue pour sauvegarder l'enregistrement
 */
async function saveRecordingDialog() {
  // Proposer un nom de fichier basé sur la date
  const date = new Date();
  const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultFilename = `heart_of_glass_${dateStr}.webm`;
  
  // Sauvegarder l'enregistrement
  const filePath = await saveRecording(defaultFilename);
  
  if (filePath) {
    updateAudioStatus('Enregistrement sauvegardé');
    if (window.addLogMessage) {
      window.addLogMessage('INFO', `Enregistrement sauvegardé: ${path.basename(filePath)}`);
    }
  } else {
    updateAudioStatus('Sauvegarde annulée');
  }
}

/**
 * Met à jour l'affichage de la lecture
 */
function updatePlaybackDisplay() {
  if (!audioBuffer) return;

  const position = getPlaybackPosition();
  const duration = audioBuffer.duration;

  // Vérifier que la position est bien dans les limites pour éviter les problèmes d'affichage
  const clampedPosition = Math.max(0, Math.min(position, duration));
  const percentage = (clampedPosition / duration) * 100;

  // Position textuelle
  const positionDisplay = document.getElementById('positionDisplay');
  if (positionDisplay) {
    const formattedPosition = formatTime(clampedPosition);
    const formattedDuration = formatTime(duration);
    positionDisplay.textContent = `${formattedPosition} / ${formattedDuration}`;
  }

  // Timeline visuelle
  const timelineProgress = document.getElementById('timelineProgress');
  const timelineHandle = document.getElementById('timelineHandle');

  if (timelineProgress) {
    // S'assurer que le pourcentage est bien dans la plage 0-100%
    const safePercentage = Math.max(0, Math.min(percentage, 100));
    timelineProgress.style.width = `${safePercentage}%`;
  }

  if (timelineHandle) {
    // S'assurer que le pourcentage est bien dans la plage 0-100%
    const safePercentage = Math.max(0, Math.min(percentage, 100));
    timelineHandle.style.left = `${safePercentage}%`;
  }

  // Affichage de la vitesse
  const speedDisplay = document.getElementById('speedDisplay');
  if (speedDisplay) {
    const direction = playDirection >= 0 ? 'avant' : 'arrière';
    speedDisplay.textContent = `Vitesse: ${Math.abs(playbackRate).toFixed(2)}x (${direction})`;
  }

  // Affichage du volume
  const volumeDisplay = document.getElementById('volumeDisplay');
  if (volumeDisplay) {
    volumeDisplay.textContent = `Volume: ${Math.round(currentVolume * 100)}%`;
  }
}

/**
 * Met à jour le statut audio affiché
 * @param {string} status - Nouveau statut
 */
function updateAudioStatus(status) {
  const audioStatus = document.getElementById('audioStatus');
  if (audioStatus) {
    audioStatus.textContent = `État: ${status}`;
  }
}

/**
 * Formate un temps en secondes au format MM:SS
 * @param {number} timeInSeconds - Temps en secondes
 * @returns {string} - Temps formaté
 */
function formatTime(timeInSeconds) {
  if (isNaN(timeInSeconds)) return '00:00';

  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Traite les données des capteurs pour contrôler l'audio
 * Implémentation fidèle à l'original
 * @param {object} sensorData - Données des capteurs
 */
function updateFromSensors(sensorData) {
  if (!isAudioInitialized || !audioBuffer) return;

  // Vérifier que nous avons des données valides
  if (!sensorData || !sensorData.leftSensor || !sensorData.rightSensor) return;

  // Ne pas mettre à jour si protection contre sauts est active
  if (sensorData.jumpProtectionActive) return;

  try {
    // S'assurer que le contexte audio est actif
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // CAPTEUR DROIT (Y/Pitch) - contrôle du volume
    const volumeValue = angleToNormalizedValue(sensorData.rightSensor.y);
    const volumePercentage = 50 + (volumeValue * 50 * sensitivityFactor);
    const volumeFinal = Math.min(100, Math.max(0, volumePercentage)) / 100;

    // Appliquer le volume
    if (Math.abs(volumeFinal - currentVolume) > 0.05) {
      currentVolume = volumeFinal;
      setVolume(volumeFinal);

      // Mise à jour de l'affichage du volume
      const volumeDisplay = document.getElementById('volumeDisplay');
      if (volumeDisplay) {
        volumeDisplay.textContent = `Volume: ${Math.round(volumeFinal * 100)}%`;
      }
    }

    // CAPTEUR GAUCHE (Y/Pitch) - contrôle de la vitesse et direction
    const speedValue = angleToNormalizedValue(sensorData.leftSensor.y);

    // Calculer la vitesse et la direction (comme dans l'original)
    let newSpeed = 0;
    let newDirection = 1;

    if (speedValue >= 0) {
      // Vitesse positive (avant)
      newSpeed = 1.0 + (speedValue * sensitivityFactor);
      newDirection = 1;
    } else {
      // Vitesse négative (arrière)
      newSpeed = Math.abs(speedValue * 2 * sensitivityFactor);
      newDirection = -1;
    }

    // Vitesse minimale
    const MIN_SPEED = 0.2;
    if (newSpeed < MIN_SPEED) {
      newSpeed = MIN_SPEED;
    }

    // Arrondir pour éviter les micro-variations
    newSpeed = Math.round(newSpeed * 100) / 100;

    // Si changement significatif de vitesse ou de direction
    if (Math.abs(newSpeed - Math.abs(playbackRate)) > 0.05 || newDirection !== Math.sign(playbackRate)) {
      // Mise à jour de la vitesse et de la direction
      playbackRate = newSpeed * newDirection;
      playDirection = newDirection;

      setPlaybackRate(newSpeed);
      setPlayDirection(newDirection);

      // Mise à jour de l'affichage de la vitesse
      const speedDisplay = document.getElementById('speedDisplay');
      if (speedDisplay) {
        const directionText = newDirection > 0 ? "avant" : "arrière";
        speedDisplay.textContent = `Vitesse: ${newSpeed.toFixed(2)}x (${directionText})`;
      }

      // Si pas déjà en lecture, démarrer
      if (!isPlaybackActive()) {
        startPlayback();
        
        // Mise à jour du bouton play/pause
        const playPauseButton = document.getElementById('playPauseButton');
        if (playPauseButton) {
          const playIcon = playPauseButton.querySelector('.play-icon-fa');
          const pauseIcon = playPauseButton.querySelector('.pause-icon-fa');
          
          if (playIcon) playIcon.style.display = 'none';
          if (pauseIcon) pauseIcon.style.display = '';
        }
        
        updateAudioStatus('Lecture en cours');
      }
    }
  } catch (error) {
    console.error('[Audio] Erreur avec les capteurs:', error);
  }
}

/**
 * Convertit l'angle en valeur normalisée entre -1 et 1
 * @param {number} angle - Angle en degrés
 * @returns {number} - Valeur normalisée
 */
function angleToNormalizedValue(angle) {
  // Plage d'angle maximale (±90 degrés)
  const maxAngle = 90;
  
  // Saturer l'angle dans la plage -maxAngle à +maxAngle
  const clampedAngle = Math.max(-maxAngle, Math.min(maxAngle, angle));
  
  // Normaliser à la plage -1 à 1
  return clampedAngle / maxAngle;
}

/**
 * Fonction de test pour la lecture
 */
function testPlayback() {
  if (!audioBuffer) {
    console.log('[Audio-Test] Aucun fichier audio chargé');
    return;
  }
  
  if (isPlaybackActive()) {
    console.log('[Audio-Test] Arrêt de la lecture de test');
    stopPlayback();
    
    // Mettre à jour l'interface
    const playPauseButton = document.getElementById('playPauseButton');
    const playIcon = playPauseButton?.querySelector('.play-icon-fa');
    const pauseIcon = playPauseButton?.querySelector('.pause-icon-fa');
    
    if (playIcon && pauseIcon) {
      playIcon.style.display = '';
      pauseIcon.style.display = 'none';
    }
    
    updateAudioStatus('En pause');
  } else {
    console.log('[Audio-Test] Démarrage lecture de test à vitesse normale');
    playbackRate = 1.0;
    playDirection = 1;
    setPlaybackRate(1.0);
    setPlayDirection(1);
    setVolume(0.8);
    currentVolume = 0.8;
    startPlayback();
    
    // Mettre à jour l'interface
    const playPauseButton = document.getElementById('playPauseButton');
    const playIcon = playPauseButton?.querySelector('.play-icon-fa');
    const pauseIcon = playPauseButton?.querySelector('.pause-icon-fa');
    
    if (playIcon && pauseIcon) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = '';
    }
    
    updateAudioStatus('Lecture en cours');
  }
}

// Exporter les fonctions et l'émetteur d'événements du module
module.exports = {
  initAudioSystem,
  loadAudioFile,
  togglePlayPause,
  updateFromSensors,
  isPlaybackActive,
  testPlayback,
  toggleRecording,
  audioEvents
};