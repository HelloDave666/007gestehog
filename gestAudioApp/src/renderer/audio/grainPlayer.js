/**
 * Lecteur de grains audio pour la synthèse granulaire
 * Implémentation fidèle à la version originale qui fonctionnait correctement
 */

// Configuration par défaut alignée avec l'original
const DEFAULT_CONFIG = {
  grainSize: 0.35,       // Taille des grains (350ms) comme l'original
  overlap: 0.92,         // Chevauchement (92%) comme l'original
  windowType: 'hann',
  maxActiveGrains: 8,    // Comme l'original
  loopPlayback: true,
  updateRate: 60         // 60Hz comme l'original
};

// Variables internes
let activeGrains = [];
let isPlaying = false;
let audioBuffer = null;
let audioContext = null;
let playbackPosition = 0;
let playDirection = 1;
let playbackRate = 1.0;
let currentVolume = 1.0;
let config = {...DEFAULT_CONFIG};
let filterNode = null;
let audioFrameId = null;
let lastFrameTime = 0;
let pendingGrainFlag = false;
let isLoopTransitioning = false;
let loopTransitionDuration = 0.25;

/**
 * Initialise le lecteur de grains
 * @param {AudioContext} context - Contexte audio à utiliser
 * @param {object} options - Options de configuration
 */
function initGrainPlayer(context, options = {}) {
  audioContext = context;
  config = {...DEFAULT_CONFIG, ...options};
  
  // Créer le filtre pour adoucir les transitions
  filterNode = audioContext.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 18000;
  filterNode.Q.value = 0.7;
  filterNode.connect(audioContext.destination);
  
  console.log('[GrainPlayer] Initialisé avec config:', config);
  return true;
}

/**
 * Définit le buffer audio à utiliser
 * @param {AudioBuffer} buffer - Buffer audio à utiliser
 */
function setAudioBuffer(buffer) {
  audioBuffer = buffer;
  playbackPosition = 0;
  console.log(`[GrainPlayer] Buffer audio défini, durée: ${buffer.duration.toFixed(2)}s`);
}

/**
 * Crée une fenêtre d'apodisation pour éliminer les artefacts
 * Implémentation exacte du code original
 */
function createWindow(type, length) {
  const window = new Float32Array(length);
  const factor = 2 * Math.PI / (length - 1);
  
  if (type === 'hann') {
    for (let i = 0; i < length; i++) {
      window[i] = 0.5 * (1 - Math.cos(i * factor));
    }
  } else if (type === 'hamming') {
    for (let i = 0; i < length; i++) {
      window[i] = 0.54 - 0.46 * Math.cos(i * factor);
    }
  } else if (type === 'rectangle') {
    for (let i = 0; i < length; i++) {
      window[i] = 1.0;
    }
  } else if (type === 'triangle') {
    for (let i = 0; i < length; i++) {
      window[i] = 1.0 - Math.abs((i - (length - 1) / 2) / ((length - 1) / 2));
    }
  } else {
    // Fenêtre simple par défaut
    for (let i = 0; i < length; i++) {
      if (i < length * 0.1 || i > length * 0.9) {
        const edge = i < length * 0.1 ? i / (length * 0.1) : (length - i) / (length * 0.1);
        window[i] = Math.sin(edge * Math.PI/2);
      } else {
        window[i] = 1.0;
      }
    }
  }
  
  return window;
}

/**
 * Planifie un grain audio - implémentation fidèle à l'original
 */
function scheduleGrain() {
  if (!isPlaying || !audioBuffer) return;
  
  try {
    // Nettoyer les sources terminées
    cleanupEndedGrains();
    
    // Si trop de grains actifs, reporter
    if (activeGrains.length >= config.maxActiveGrains) {
      return;
    }
    
    // Paramètres du grain
    const grainSize = config.grainSize;
    const absRate = Math.abs(playbackRate);
    
    // Position actuelle avec légère variation aléatoire pour réduire les artefacts
    let grainPosition = playbackPosition + (Math.random() * 0.01 - 0.005);
    
    // === GESTION AMÉLIORÉE DES LIMITES EN MODE BOUCLE ===
    let isTransitionGrain = false;  // Indique si ce grain est un grain de transition
    
    if (config.loopPlayback) {
      // Détecter si nous approchons d'une limite pour préparer une transition
      const approachingStart = grainPosition < grainSize && playDirection < 0;
      const approachingEnd = (grainPosition + grainSize) > audioBuffer.duration && playDirection > 0;
      
      if (approachingStart || approachingEnd) {
        // Marquer la transition
        isLoopTransitioning = true;
        isTransitionGrain = true;
        
        if (approachingStart) {
          // Lecture arrière approchant le début: préparer le grain de fin
          const grainPositionFromEnd = audioBuffer.duration - Math.abs(grainPosition);
          if (grainPosition < 0) {
            // Déjà passé sous zéro, utiliser la position depuis la fin
            grainPosition = grainPositionFromEnd;
          } else {
            // Planifier un grain supplémentaire à la fin pour assurer une transition fluide
            scheduleTransitionGrain(grainPositionFromEnd, absRate);
          }
        }
        else if (approachingEnd) {
          // Lecture avant approchant la fin: préparer le grain de début
          const grainPositionFromStart = grainPosition - audioBuffer.duration;
          if (grainPosition >= audioBuffer.duration) {
            // Déjà dépassé la fin, utiliser la position depuis le début
            grainPosition = grainPositionFromStart;
          } else {
            // Planifier un grain supplémentaire au début pour assurer une transition fluide
            scheduleTransitionGrain(grainPositionFromStart, absRate);
          }
        }
      }
      else {
        // Hors zone de transition, ajustement normal des limites
        if (grainPosition < 0) {
          grainPosition = audioBuffer.duration + grainPosition;
        } else if (grainPosition >= audioBuffer.duration) {
          grainPosition = grainPosition - audioBuffer.duration;
        }
        
        // Fin de la transition si nous étions dedans
        if (isLoopTransitioning) {
          isLoopTransitioning = false;
        }
      }
    } else {
      // Mode sans boucle: vérifier les limites
      if (grainPosition < 0) {
        grainPosition = 0;
      } else if (grainPosition >= audioBuffer.duration) {
        grainPosition = audioBuffer.duration - 0.01;
      }
    }
    
    // Calculer la durée disponible à cette position
    let availableDuration = grainSize;
    if (grainPosition + availableDuration > audioBuffer.duration) {
      availableDuration = audioBuffer.duration - grainPosition;
    }
    
    if (availableDuration < 0.05) return; // Éviter les grains trop courts
    
    // Création des nœuds audio
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = absRate;
    
    const gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(filterNode);
    
    // Timings précis
    const currentTime = audioContext.currentTime;
    const startTime = currentTime + 0.005;
    const grainDuration = availableDuration / absRate;
    const stopTime = startTime + grainDuration;
    
    // Créer une fenêtre d'apodisation pour éviter les clics
    const windowSamples = 100;
    const windowCurve = createWindow(config.windowType, windowSamples);
    
    // Remplir le tableau d'automation pour la courbe complète
    const fadeSteps = windowSamples * 2 + 1;
    const fullGainCurve = new Float32Array(fadeSteps);
    
    // Appliquer la fenêtre
    for (let i = 0; i < windowSamples; i++) {
      fullGainCurve[i] = windowCurve[i] * currentVolume;
    }
    
    for (let i = windowSamples; i < windowSamples + 1; i++) {
      fullGainCurve[i] = currentVolume;
    }
    
    for (let i = 0; i < windowSamples; i++) {
      fullGainCurve[windowSamples + 1 + i] = windowCurve[windowSamples - 1 - i] * currentVolume;
    }
    
    // Appliquer la courbe de gain
    try {
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.setValueCurveAtTime(fullGainCurve, startTime, grainDuration);
    } catch (e) {
      // Fallback linéaire en cas d'erreur
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(currentVolume, startTime + grainDuration * 0.15);
      gainNode.gain.setValueAtTime(currentVolume, startTime + grainDuration * 0.15);
      gainNode.gain.linearRampToValueAtTime(0, stopTime);
    }
    
    // Démarrer la lecture
    source.start(startTime, grainPosition, availableDuration);
    source.stop(stopTime);
    
    // Stocker les informations
    const grain = {
      source: source,
      gainNode: gainNode,
      startTime: startTime,
      endTime: stopTime,
      grainPosition: grainPosition,
      isTransitionGrain: isTransitionGrain
    };
    
    activeGrains.push(grain);
    
    return true;
  } catch (error) {
    console.error('[GrainPlayer] Erreur grain:', error.message);
    return false;
  }
}

/**
 * Planifier un grain de transition spécifique pour les boucles fluides
 */
function scheduleTransitionGrain(position, rate) {
  if (!isPlaying || !audioBuffer || position < 0 || position >= audioBuffer.duration) return;
  
  try {
    // Paramètres du grain de transition
    let grainSize = config.grainSize * 1.2; // Légèrement plus grand pour une meilleure transition
    
    // Limiter la taille si nécessaire
    if (position + grainSize > audioBuffer.duration) {
      grainSize = audioBuffer.duration - position;
    }
    
    if (grainSize < 0.05) return; // Trop petit pour être utile
    
    // Créer source et gain
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = rate;
    
    const gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(filterNode);
    
    // Timing
    const currentTime = audioContext.currentTime;
    const startTime = currentTime + 0.005;
    const grainDuration = grainSize / rate;
    const stopTime = startTime + grainDuration;
    
    // Courbe de fondu spéciale pour les transitions
    const fadeTime = grainDuration * 0.4; // Longue transition
    
    // Volume légèrement réduit pour le grain de transition (mélange plus doux)
    const transitionVolume = currentVolume * 0.85;
    
    // Appliquer gain avec fondus
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(transitionVolume, startTime + fadeTime);
    gainNode.gain.linearRampToValueAtTime(0, stopTime);
    
    // Démarrer la lecture
    source.start(startTime, position, grainSize);
    source.stop(stopTime);
    
    // Stocker
    const grain = {
      source: source,
      gainNode: gainNode,
      startTime: startTime,
      endTime: stopTime,
      grainPosition: position,
      isTransitionGrain: true
    };
    
    activeGrains.push(grain);
    
    return true;
  } catch (error) {
    console.error('[GrainPlayer] Erreur grain de transition:', error.message);
    return false;
  }
}

/**
 * Démarrer la lecture granulaire
 * @returns {boolean} - Succès de l'opération
 */
function startPlayback() {
  if (!audioContext || !audioBuffer) {
    console.error('[GrainPlayer] Impossible de démarrer: contexte ou buffer manquant');
    return false;
  }
  
  // S'assurer que le contexte audio est actif
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  console.log('[GrainPlayer] Démarrage de la lecture');
  isPlaying = true;
  lastFrameTime = performance.now();
  activeGrains = [];
  pendingGrainFlag = false;
  isLoopTransitioning = false;
  
  // Arrêter la boucle précédente si elle existe
  if (audioFrameId) {
    cancelAnimationFrame(audioFrameId);
    audioFrameId = null;
  }
  
  // Démarrer la boucle principale
  scheduleAudioUpdate();
  
  console.log('[GrainPlayer] Lecture démarrée');
  return true;
}

/**
 * Planificateur audio principal - reproduit fidèlement l'original
 */
function scheduleAudioUpdate() {
  if (!isPlaying) return;
  
  const now = performance.now();
  const deltaTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  
  // Protection contre les grands intervalles (comme dans l'original)
  const safeDeltaTime = Math.min(deltaTime, 0.05);
  
  // Mise à jour de la position
  const positionChange = safeDeltaTime * playbackRate * playDirection;
  playbackPosition += positionChange;
  
  // Gestion de la lecture en boucle
  if (config.loopPlayback) {
    // Gérer les limites en mode boucle
    if (playbackPosition < 0) {
      // Boucle: début → fin (en lecture arrière)
      const overshoot = -playbackPosition;
      playbackPosition = audioBuffer.duration - overshoot;
      console.log("[GrainPlayer] Boucle: passage du début à la fin");
    } 
    else if (playbackPosition > audioBuffer.duration) {
      // Boucle: fin → début (en lecture avant)
      const overshoot = playbackPosition - audioBuffer.duration;
      playbackPosition = overshoot;
      console.log("[GrainPlayer] Boucle: passage de la fin au début");
    }
  } 
  else {
    // Mode sans boucle: arrêter aux limites
    if (playbackPosition < 0) {
      playbackPosition = 0;
      console.log("[GrainPlayer] Début du morceau atteint");
    } else if (playbackPosition > audioBuffer.duration) {
      playbackPosition = audioBuffer.duration;
      console.log("[GrainPlayer] Fin du morceau atteinte");
    }
  }
  
  // Mise à jour du filtre
  updateFilter();
  
  // Planifier le grain si nécessaire
  if (!pendingGrainFlag) {
    scheduleGrain();
    pendingGrainFlag = true;
    
    // Réinitialiser le drapeau après un délai pour le prochain grain
    const grainInterval = config.grainSize * (1 - config.overlap) / Math.max(0.1, Math.abs(playbackRate));
    setTimeout(() => {
      pendingGrainFlag = false;
    }, grainInterval * 1000);
  }
  
  // Continuer la boucle avec requestAnimationFrame (comme dans l'original)
  audioFrameId = requestAnimationFrame(scheduleAudioUpdate);
}

/**
 * Arrête la lecture granulaire
 */
function stopPlayback() {
  if (!isPlaying) return;
  
  isPlaying = false;
  
  // Arrêter la boucle principale
  if (audioFrameId) {
    cancelAnimationFrame(audioFrameId);
    audioFrameId = null;
  }
  
  // Arrêter tous les grains actifs
  stopAllGrains();
  
  console.log('[GrainPlayer] Lecture arrêtée');
}

/**
 * Arrête tous les grains actifs
 */
function stopAllGrains() {
  const now = audioContext.currentTime;
  
  activeGrains.forEach(grain => {
    try {
      // Fondu de sortie rapide
      if (grain.gainNode) {
        grain.gainNode.gain.cancelScheduledValues(now);
        grain.gainNode.gain.setValueAtTime(grain.gainNode.gain.value || 0, now);
        grain.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
      }
      
      // Arrêter après le fondu
      setTimeout(() => {
        try {
          grain.source.stop();
          if (grain.gainNode) grain.gainNode.disconnect();
          grain.source.disconnect();
        } catch (e) {
          // Ignorer les erreurs (grain déjà arrêté)
        }
      }, 60);
    } catch (e) {
      // Ignorer les erreurs
    }
  });
  
  // Vider la file après le fondu
  setTimeout(() => {
    activeGrains = [];
  }, 100);
}

/**
 * Nettoie les grains terminés
 */
function cleanupEndedGrains() {
  const now = audioContext.currentTime;
  
  activeGrains = activeGrains.filter(grain => {
    if (grain.endTime <= now) {
      try {
        grain.gainNode.disconnect();
        grain.source.disconnect();
      } catch (e) {
        // Ignorer les erreurs
      }
      return false; // Supprimer de la file
    }
    return true; // Garder dans la file
  });
}

/**
 * Adapter le filtre en fonction de la vitesse
 */
function updateFilter() {
  if (!filterNode) return;
  
  // Ajuster le filtre passe-bas en fonction de la vitesse
  if (Math.abs(playbackRate) > 2.0) {
    const filterFreq = 21000 - (Math.abs(playbackRate) - 2.0) * 2000;
    filterNode.frequency.value = Math.max(8000, filterFreq);
    filterNode.Q.value = Math.min(1.0, Math.abs(playbackRate) / 3);
  } else {
    // À vitesse normale ou lente, garder une fréquence haute (peu d'effet)
    filterNode.frequency.value = 20000;
    filterNode.Q.value = 0.5;
  }
}

/**
 * Met à jour le taux de lecture
 * @param {number} rate - Nouveau taux de lecture
 */
function setPlaybackRate(rate) {
  playbackRate = rate;
}

/**
 * Définit la direction de lecture
 * @param {number} direction - Direction (1 = avant, -1 = arrière)
 */
function setPlayDirection(direction) {
  playDirection = direction;
}

/**
 * Définit le volume
 * @param {number} volume - Volume (0-1)
 */
function setVolume(volume) {
  currentVolume = Math.max(0, Math.min(1, volume));
}

/**
 * Met à jour les paramètres du lecteur de grains
 * @param {object} options - Nouveaux paramètres
 */
function updateConfig(options) {
  const oldConfig = {...config};
  config = {...config, ...options};
}

/**
 * Obtient la position de lecture actuelle
 * @returns {number} - Position de lecture (secondes)
 */
function getPlaybackPosition() {
  return playbackPosition;
}

/**
 * Définit la position de lecture
 * @param {number} position - Nouvelle position (secondes)
 */
function setPlaybackPosition(position) {
  playbackPosition = Math.max(0, Math.min(audioBuffer ? audioBuffer.duration : 0, position));
}

/**
 * Indique si la lecture est en cours
 * @returns {boolean} - État de lecture
 */
function isPlaybackActive() {
  return isPlaying;
}

// Exporter les fonctions du module
module.exports = {
  initGrainPlayer,
  setAudioBuffer,
  startPlayback,
  stopPlayback,
  isPlaybackActive,
  setPlaybackRate,
  setPlayDirection,
  setVolume,
  updateConfig,
  getPlaybackPosition,
  setPlaybackPosition
};