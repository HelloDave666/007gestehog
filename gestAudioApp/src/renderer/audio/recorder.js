/**
 * Module d'enregistrement audio
 * Gère l'enregistrement et la sauvegarde des sessions audio
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

// Émetteur d'événements
const recorderEvents = new EventEmitter();

// État de l'enregistreur
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = 0;
let recordingDuration = 0;
let recordingUpdateInterval = null;
let audioContext = null;
let recordingStream = null;
let recordingDestination = null;

/**
 * Initialise le système d'enregistrement
 * @param {AudioContext} context - Contexte audio existant à utiliser
 */
function initRecorder(context) {
  audioContext = context;
  console.log('[Recorder] Système d\'enregistrement initialisé');
  return true;
}

/**
 * Démarre l'enregistrement audio
 * @returns {boolean} - Succès de l'opération
 */
async function startRecording() {
  if (isRecording) {
    console.warn('[Recorder] Enregistrement déjà en cours');
    return false;
  }

  try {
    console.log('[Recorder] Démarrage de l\'enregistrement');
    
    // Réinitialiser les données
    recordedChunks = [];
    
    // Obtenir l'accès au flux audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingStream = stream;
    
    // Créer le MediaRecorder avec des options de qualité
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000
    });
    
    // Créer un nœud de destination pour surveiller l'enregistrement si nécessaire
    if (audioContext) {
      recordingDestination = audioContext.createMediaStreamDestination();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(recordingDestination);
    }
    
    // Écouter les événements de données
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    // Écouter l'événement d'arrêt
    mediaRecorder.onstop = () => {
      finishRecording();
    };
    
    // Démarrer l'enregistrement
    mediaRecorder.start(1000); // Collecter les données toutes les secondes
    
    // Mettre à jour l'état
    isRecording = true;
    recordingStartTime = Date.now();
    
    // Démarrer l'intervalle de mise à jour de la durée
    recordingUpdateInterval = setInterval(updateRecordingDuration, 500);
    
    // Émettre l'événement de démarrage
    recorderEvents.emit('recordingStarted');
    
    return true;
  } catch (error) {
    console.error('[Recorder] Erreur lors du démarrage de l\'enregistrement:', error);
    return false;
  }
}

/**
 * Arrête l'enregistrement audio
 * @returns {boolean} - Succès de l'opération
 */
function stopRecording() {
  if (!isRecording || !mediaRecorder) {
    console.warn('[Recorder] Aucun enregistrement en cours');
    return false;
  }
  
  console.log('[Recorder] Arrêt de l\'enregistrement');
  
  // Arrêter le MediaRecorder
  try {
    mediaRecorder.stop();
  } catch (error) {
    console.error('[Recorder] Erreur lors de l\'arrêt de l\'enregistrement:', error);
  }
  
  return true;
}

/**
 * Finalise l'enregistrement et prépare le fichier
 */
function finishRecording() {
  // Arrêter l'intervalle de mise à jour
  if (recordingUpdateInterval) {
    clearInterval(recordingUpdateInterval);
    recordingUpdateInterval = null;
  }
  
  // Arrêter les pistes du stream
  if (recordingStream) {
    recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
  }
  
  // Nettoyer le nœud de destination
  if (recordingDestination) {
    recordingDestination.disconnect();
    recordingDestination = null;
  }
  
  // Mettre à jour l'état
  isRecording = false;
  
  // Calculer la durée finale
  const endTime = Date.now();
  recordingDuration = (endTime - recordingStartTime) / 1000;
  
  // Vérifier si des données ont été enregistrées
  if (recordedChunks.length === 0) {
    console.error('[Recorder] Aucune donnée enregistrée');
    recorderEvents.emit('recordingError', 'Aucune donnée enregistrée');
    return;
  }
  
  // Notifier la fin de l'enregistrement
  recorderEvents.emit('recordingStopped', {
    duration: recordingDuration,
    chunks: recordedChunks.length
  });
}

/**
 * Met à jour la durée de l'enregistrement en cours
 */
function updateRecordingDuration() {
  if (!isRecording) return;
  
  const currentTime = Date.now();
  recordingDuration = (currentTime - recordingStartTime) / 1000;
  
  // Émettre l'événement de mise à jour
  recorderEvents.emit('recordingUpdate', {
    duration: recordingDuration,
    isActive: isRecording
  });
}

/**
 * Sauvegarde l'enregistrement dans un fichier
 * @param {string} filename - Nom de fichier suggéré
 * @returns {Promise<string>} - Chemin du fichier sauvegardé
 */
async function saveRecording(filename = '') {
  if (recordedChunks.length === 0) {
    console.error('[Recorder] Aucune donnée à sauvegarder');
    return null;
  }
  
  try {
    // Créer un blob à partir des chunks
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    
    // Générer un nom de fichier par défaut si non spécifié
    if (!filename) {
      const date = new Date();
      const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      filename = `enregistrement_${dateStr}.webm`;
    }
    
    // Demander à l'utilisateur où sauvegarder le fichier
    const result = await ipcRenderer.invoke('save-dialog', {
      title: 'Sauvegarder l\'enregistrement',
      defaultPath: filename,
      filters: [
        { name: 'Fichiers audio', extensions: ['webm', 'ogg', 'wav'] }
      ]
    });
    
    if (result.canceled) {
      console.log('[Recorder] Sauvegarde annulée par l\'utilisateur');
      return null;
    }
    
    // Convertir le blob en buffer
    const buffer = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(Buffer.from(reader.result));
      reader.readAsArrayBuffer(blob);
    });
    
    // Sauvegarder le fichier
    fs.writeFileSync(result.filePath, buffer);
    
    console.log(`[Recorder] Enregistrement sauvegardé: ${result.filePath}`);
    recorderEvents.emit('recordingSaved', { path: result.filePath });
    
    return result.filePath;
  } catch (error) {
    console.error('[Recorder] Erreur lors de la sauvegarde:', error);
    recorderEvents.emit('recordingError', error.message);
    return null;
  }
}

/**
 * Vérifie si un enregistrement est en cours
 * @returns {boolean} - État de l'enregistrement
 */
function isRecordingActive() {
  return isRecording;
}

/**
 * Obtient la durée actuelle de l'enregistrement
 * @returns {number} - Durée en secondes
 */
function getRecordingDuration() {
  return recordingDuration;
}

// Exporter les fonctions du module
module.exports = {
  initRecorder,
  startRecording,
  stopRecording,
  saveRecording,
  isRecordingActive,
  getRecordingDuration,
  recorderEvents
};