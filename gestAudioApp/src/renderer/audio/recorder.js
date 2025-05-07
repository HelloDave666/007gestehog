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
    
    // Obtenir directement le flux audio du système
    const constraints = {
      audio: {
        // Spécifier qu'on veut l'audio du système et non le micro
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    };
    
    // Tenter d'obtenir le flux média
    recordingStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Créer le MediaRecorder avec des options de haute qualité
    mediaRecorder = new MediaRecorder(recordingStream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 256000 // Augmenter la qualité
    });
    
    // Écouter les événements de données
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        console.log(`[Recorder] Chunk reçu: ${event.data.size} octets`);
      }
    };
    
    // Écouter l'événement d'arrêt
    mediaRecorder.onstop = () => {
      console.log('[Recorder] MediaRecorder arrêté, finalisation...');
      finishRecording();
    };
    
    // Démarrer l'enregistrement avec des chunks plus petits
    mediaRecorder.start(500); // Collecter les données toutes les 500ms
    
    // Mettre à jour l'état
    isRecording = true;
    recordingStartTime = Date.now();
    
    // Démarrer l'intervalle de mise à jour de la durée
    recordingUpdateInterval = setInterval(updateRecordingDuration, 500);
    
    // Émettre l'événement de démarrage
    recorderEvents.emit('recordingStarted');
    console.log('[Recorder] Enregistrement démarré avec succès');
    
    return true;
  } catch (error) {
    console.error('[Recorder] Erreur lors du démarrage de l\'enregistrement:', error);
    // Nettoyer en cas d'erreur
    if (recordingStream) {
      recordingStream.getTracks().forEach(track => track.stop());
      recordingStream = null;
    }
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
  
  console.log('[Recorder] Arrêt de l\'enregistrement demandé');
  
  // Arrêter le MediaRecorder avec gestion d'erreur
  try {
    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      console.log('[Recorder] MediaRecorder.stop() appelé');
    } else {
      console.warn('[Recorder] MediaRecorder déjà inactif');
      finishRecording(); // Appeler finishRecording manuellement
    }
  } catch (error) {
    console.error('[Recorder] Erreur lors de l\'arrêt de l\'enregistrement:', error);
    finishRecording(); // Tenter de finaliser malgré l'erreur
  }
  
  return true;
}

/**
 * Finalise l'enregistrement et prépare le fichier
 */
function finishRecording() {
  console.log('[Recorder] Finalisation de l\'enregistrement...');
  
  // Arrêter l'intervalle de mise à jour
  if (recordingUpdateInterval) {
    clearInterval(recordingUpdateInterval);
    recordingUpdateInterval = null;
  }
  
  // Arrêter les pistes du stream si nécessaire
  if (recordingStream) {
    recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
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
  
  console.log(`[Recorder] Enregistrement terminé: ${recordedChunks.length} chunks, ${recordingDuration.toFixed(1)}s`);
  
  // Notifier la fin de l'enregistrement
  recorderEvents.emit('recordingStopped', {
    duration: recordingDuration,
    chunks: recordedChunks.length
  });
  
  // Le bloc setTimeout a été supprimé pour éviter les doubles dialogues de sauvegarde
  // La sauvegarde sera gérée uniquement par audioSystem.js via saveRecordingDialog()
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
 * Affiche le dialogue de sauvegarde
 */
async function saveRecordingDialog() {
  console.log('[Recorder] Préparation de la boîte de dialogue de sauvegarde...');
  
  // Proposer un nom de fichier basé sur la date
  const date = new Date();
  const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultFilename = `heart_of_glass_${dateStr}.webm`;
  
  // Sauvegarder l'enregistrement
  try {
    const filePath = await saveRecording(defaultFilename);
    
    if (filePath) {
      console.log(`[Recorder] Enregistrement sauvegardé avec succès: ${filePath}`);
      recorderEvents.emit('recordingSaved', { path: filePath });
    } else {
      console.log('[Recorder] Sauvegarde annulée ou échouée');
      recorderEvents.emit('recordingError', 'Sauvegarde annulée');
    }
  } catch (error) {
    console.error('[Recorder] Erreur lors de la sauvegarde:', error);
    recorderEvents.emit('recordingError', `Erreur: ${error.message}`);
  }
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
    console.log(`[Recorder] Création du blob à partir de ${recordedChunks.length} chunks`);
    
    // Créer un blob à partir des chunks
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    console.log(`[Recorder] Blob créé: ${blob.size} octets`);
    
    // Générer un nom de fichier par défaut si non spécifié
    if (!filename) {
      const date = new Date();
      const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      filename = `enregistrement_${dateStr}.webm`;
    }
    
    console.log('[Recorder] Affichage de la boîte de dialogue de sauvegarde...');
    
    // Demander à l'utilisateur où sauvegarder le fichier
    const result = await ipcRenderer.invoke('save-dialog', {
      title: 'Sauvegarder l\'enregistrement',
      defaultPath: filename,
      filters: [
        { name: 'Fichiers audio', extensions: ['webm', 'ogg', 'wav'] }
      ]
    });
    
    console.log('[Recorder] Résultat de la boîte de dialogue:', result);
    
    if (!result || result.canceled) {
      console.log('[Recorder] Sauvegarde annulée par l\'utilisateur');
      return null;
    }
    
    // Convertir le blob en buffer
    console.log('[Recorder] Conversion du blob en buffer...');
    const buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(Buffer.from(reader.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    
    console.log(`[Recorder] Écriture du fichier ${result.filePath}...`);
    
    // Sauvegarder le fichier
    fs.writeFileSync(result.filePath, buffer);
    
    console.log(`[Recorder] Enregistrement sauvegardé: ${result.filePath}`);
    
    return result.filePath;
  } catch (error) {
    console.error('[Recorder] Erreur lors de la sauvegarde:', error);
    throw error;
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