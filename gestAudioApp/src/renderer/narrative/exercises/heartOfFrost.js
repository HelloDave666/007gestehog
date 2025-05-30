/**
 * Exercice "Cœur de givre" - Rotation circulaire parfaite
 * Simule la rotation d'une baguette de verre dans la flamme
 * Version avec connexion audio améliorée
 */

const { EventEmitter } = require('events');

class HeartOfFrostExercise extends EventEmitter {
  constructor() {
    super();
    
    // Paramètres de l'exercice
    this.targetRotations = 8;
    this.targetBPM = 60; // 1 rotation par seconde
    this.tempoTolerance = 0.2; // 20% de tolérance sur le tempo (augmenté pour plus de flexibilité)
    this.circularityThreshold = 0.8; // 80% de circularité minimum
    
    // État de l'exercice
    this.isActive = false;
    this.rotationCount = 0;
    this.rotationHistory = [];
    this.positionHistory = [];
    this.lastAngle = null;
    this.totalAngle = 0;
    this.startTime = null;
    this.lastRotationTime = null;
    
    // Paramètres de détection
    this.centerX = 0;
    this.centerY = 0;
    this.calibrated = false;
    
    // Métriques
    this.tempoAccuracy = 0;
    this.circularityScore = 0;
    this.currentBPM = 0;
    
    // Connexion audio améliorée
    this.audioConnected = false;
    this.lastAudioUpdate = 0;
    this.audioUpdateFrequency = 100; // Mettre à jour l'audio toutes les 100ms
  }

  /**
   * Démarre l'exercice
   */
  start() {
    console.log('[HeartOfFrost] Démarrage de l\'exercice');
    this.reset();
    this.isActive = true;
    this.startTime = Date.now();
    
    // Vérifier et établir la connexion audio
    this.establishAudioConnection();
    
    this.emit('started', {
      targetRotations: this.targetRotations,
      targetBPM: this.targetBPM
    });
  }

  /**
   * Établit la connexion avec le système audio
   */
  establishAudioConnection() {
    if (window.audioSystem) {
      this.audioConnected = true;
      console.log('[HeartOfFrost] Connexion audio établie');
      
      // Vérifier les méthodes disponibles
      const availableMethods = [];
      if (typeof window.audioSystem.setPlaybackRate === 'function') {
        availableMethods.push('setPlaybackRate');
      }
      if (typeof window.audioSystem.setVolume === 'function') {
        availableMethods.push('setVolume');
      }
      if (typeof window.audioSystem.setPlaybackDirection === 'function') {
        availableMethods.push('setPlaybackDirection');
      }
      if (typeof window.audioSystem.updateConfig === 'function') {
        availableMethods.push('updateConfig');
      }
      
      console.log('[HeartOfFrost] Méthodes audio disponibles:', availableMethods);
      
      // Initialiser les paramètres audio de base
      this.initializeAudioSettings();
    } else {
      this.audioConnected = false;
      console.warn('[HeartOfFrost] Système audio non disponible');
    }
  }

  /**
   * Initialise les paramètres audio de base
   */
  initializeAudioSettings() {
    if (!this.audioConnected) return;
    
    try {
      // Réinitialiser les paramètres audio
      if (typeof window.audioSystem.setPlaybackRate === 'function') {
        window.audioSystem.setPlaybackRate(1.0);
      }
      if (typeof window.audioSystem.setVolume === 'function') {
        window.audioSystem.setVolume(0.7);
      }
      if (typeof window.audioSystem.setPlaybackDirection === 'function') {
        window.audioSystem.setPlaybackDirection(1);
      }
      
      console.log('[HeartOfFrost] Paramètres audio initialisés');
    } catch (error) {
      console.error('[HeartOfFrost] Erreur lors de l\'initialisation audio:', error);
    }
  }

  /**
   * Réinitialise l'exercice
   */
  reset() {
    this.rotationCount = 0;
    this.rotationHistory = [];
    this.positionHistory = [];
    this.lastAngle = null;
    this.totalAngle = 0;
    this.startTime = null;
    this.lastRotationTime = null;
    this.calibrated = false;
    this.tempoAccuracy = 0;
    this.circularityScore = 0;
    this.currentBPM = 0;
    this.lastAudioUpdate = 0;
    
    // Réinitialiser l'audio
    this.initializeAudioSettings();
  }

  /**
   * Met à jour avec les données du capteur
   */
  update(sensorData) {
    if (!this.isActive) return;

    // Utiliser le capteur gauche au lieu du droit pour cet exercice
    const x = sensorData.left ? sensorData.left.x : 0;
    const y = sensorData.left ? sensorData.left.y : 0;
    
    // Calibration au premier mouvement
    if (!this.calibrated && this.positionHistory.length === 0) {
      this.centerX = x;
      this.centerY = y;
      this.calibrated = true;
      console.log('[HeartOfFrost] Calibrage effectué:', { centerX: this.centerX, centerY: this.centerY });
    }
    
    // Enregistrer la position (relative au centre)
    const relX = x - this.centerX;
    const relY = y - this.centerY;
    
    this.positionHistory.push({
      x: relX,
      y: relY,
      timestamp: Date.now()
    });
    
    // Garder seulement les 2 dernières secondes de données
    const cutoffTime = Date.now() - 2000;
    this.positionHistory = this.positionHistory.filter(p => p.timestamp > cutoffTime);
    
    // Calculer l'angle actuel
    const currentAngle = Math.atan2(relY, relX);
    
    if (this.lastAngle !== null) {
      // Calculer la différence d'angle
      let angleDiff = currentAngle - this.lastAngle;
      
      // Gérer le passage de -π à π
      if (angleDiff > Math.PI) {
        angleDiff -= 2 * Math.PI;
      } else if (angleDiff < -Math.PI) {
        angleDiff += 2 * Math.PI;
      }
      
      this.totalAngle += angleDiff;
      
      // Détecter une rotation complète
      if (Math.abs(this.totalAngle) >= 2 * Math.PI) {
        this.onRotationComplete();
        this.totalAngle = 0;
      }
    }
    
    this.lastAngle = currentAngle;
    
    // Calculer les métriques
    this.calculateMetrics();
    
    // Mettre à jour l'audio avec une fréquence contrôlée
    const now = Date.now();
    if (now - this.lastAudioUpdate > this.audioUpdateFrequency) {
      this.updateAudioFeedback();
      this.lastAudioUpdate = now;
    }
    
    // Émettre la mise à jour
    this.emit('update', {
      position: { x: relX, y: relY },
      rotationCount: this.rotationCount,
      angle: currentAngle,
      progress: this.totalAngle / (2 * Math.PI),
      metrics: {
        tempo: this.currentBPM,
        tempoAccuracy: this.tempoAccuracy,
        circularity: this.circularityScore
      },
      audioConnected: this.audioConnected
    });
  }

  /**
   * Met à jour le feedback audio en temps réel
   */
  updateAudioFeedback() {
    if (!this.audioConnected) return;
    
    const audioParams = this.getAudioParameters();
    
    // Log détaillé pour le débogage (moins fréquent)
    if (Math.random() < 0.02) { // Log seulement 2% du temps
      console.log('[HeartOfFrost] Paramètres audio:', {
        speed: audioParams.speed.toFixed(3),
        volume: audioParams.volume.toFixed(3),
        direction: audioParams.direction,
        tempoAccuracy: this.tempoAccuracy.toFixed(3),
        circularity: this.circularityScore.toFixed(3)
      });
    }
    
    // Appliquer les paramètres directement au système audio
    try {
      if (typeof window.audioSystem.setPlaybackRate === 'function') {
        window.audioSystem.setPlaybackRate(audioParams.speed);
      }
      
      if (typeof window.audioSystem.setVolume === 'function') {
        window.audioSystem.setVolume(audioParams.volume);
      }
      
      if (typeof window.audioSystem.setPlaybackDirection === 'function') {
        window.audioSystem.setPlaybackDirection(audioParams.direction);
      }
      
      if (typeof window.audioSystem.updateConfig === 'function') {
        window.audioSystem.updateConfig({
          grainSize: audioParams.grainSize,
          overlap: audioParams.overlap
        });
      }
      
    } catch (error) {
      console.error('[HeartOfFrost] Erreur lors de l\'application des paramètres audio:', error);
      this.audioConnected = false; // Marquer comme déconnecté en cas d'erreur
    }
  }

  /**
   * Appelé quand une rotation complète est détectée
   */
  onRotationComplete() {
    const now = Date.now();
    
    if (this.lastRotationTime) {
      const rotationDuration = now - this.lastRotationTime;
      const rotationBPM = 60000 / rotationDuration; // Convertir en BPM
      
      this.rotationHistory.push({
        duration: rotationDuration,
        bpm: rotationBPM,
        timestamp: now
      });
      
      // Garder seulement les 5 dernières rotations
      if (this.rotationHistory.length > 5) {
        this.rotationHistory.shift();
      }
      
      console.log(`[HeartOfFrost] Rotation ${this.rotationCount + 1}: ${rotationBPM.toFixed(1)} BPM (cible: ${this.targetBPM} BPM)`);
    }
    
    this.lastRotationTime = now;
    this.rotationCount++;
    
    // Feedback audio spécial pour la rotation complète
    this.playRotationFeedback();
    
    this.emit('rotationComplete', {
      count: this.rotationCount,
      totalTarget: this.targetRotations,
      currentBPM: this.rotationHistory.length > 0 ? this.rotationHistory[this.rotationHistory.length - 1].bpm : 0
    });
    
    // Vérifier si l'exercice est terminé
    if (this.rotationCount >= this.targetRotations) {
      this.complete();
    }
  }

  /**
   * Joue un feedback audio spécial pour les rotations complètes
   */
  playRotationFeedback() {
    if (!this.audioConnected) return;
    
    try {
      // Brève augmentation du volume pour marquer la rotation
      const currentVolume = window.audioSystem.getVolume ? window.audioSystem.getVolume() : 0.7;
      
      if (typeof window.audioSystem.setVolume === 'function') {
        window.audioSystem.setVolume(Math.min(1.0, currentVolume * 1.3));
        
        // Rétablir le volume normal après 200ms
        setTimeout(() => {
          if (typeof window.audioSystem.setVolume === 'function') {
            window.audioSystem.setVolume(currentVolume);
          }
        }, 200);
      }
      
    } catch (error) {
      console.error('[HeartOfFrost] Erreur lors du feedback de rotation:', error);
    }
  }

  /**
   * Calcule les métriques de performance
   */
  calculateMetrics() {
    // Calculer le BPM moyen
    if (this.rotationHistory.length > 0) {
      const avgBPM = this.rotationHistory.reduce((sum, r) => sum + r.bpm, 0) / this.rotationHistory.length;
      this.currentBPM = avgBPM;
      
      // Calculer la précision du tempo avec une tolérance plus souple
      const tempoDiff = Math.abs(avgBPM - this.targetBPM);
      const maxDiff = this.targetBPM * this.tempoTolerance;
      this.tempoAccuracy = Math.max(0, 1 - (tempoDiff / maxDiff));
    }
    
    // Calculer la circularité
    if (this.positionHistory.length > 10) {
      this.circularityScore = this.calculateCircularity();
    }
  }

  /**
   * Calcule le score de circularité du mouvement
   */
  calculateCircularity() {
    if (this.positionHistory.length < 10) return 0;
    
    // Calculer le centre et le rayon moyens
    let sumX = 0, sumY = 0;
    this.positionHistory.forEach(p => {
      sumX += p.x;
      sumY += p.y;
    });
    
    const avgX = sumX / this.positionHistory.length;
    const avgY = sumY / this.positionHistory.length;
    
    // Calculer le rayon moyen
    let sumRadius = 0;
    const radii = this.positionHistory.map(p => {
      const r = Math.sqrt(Math.pow(p.x - avgX, 2) + Math.pow(p.y - avgY, 2));
      sumRadius += r;
      return r;
    });
    
    const avgRadius = sumRadius / radii.length;
    
    if (avgRadius === 0) return 0; // Éviter la division par zéro
    
    // Calculer la variance du rayon (plus c'est bas, plus c'est circulaire)
    const variance = radii.reduce((sum, r) => {
      return sum + Math.pow(r - avgRadius, 2);
    }, 0) / radii.length;
    
    // Convertir en score de 0 à 1 (1 = cercle parfait)
    const stdDev = Math.sqrt(variance);
    const normalizedStdDev = stdDev / avgRadius; // Normaliser par le rayon
    
    // Score inversé : plus la déviation est faible, plus le score est élevé
    return Math.max(0, 1 - normalizedStdDev * 2);
  }

  /**
   * Termine l'exercice
   */
  complete() {
    this.isActive = false;
    
    const finalScore = this.calculateFinalScore();
    
    // Feedback audio de fin
    this.playCompletionFeedback();
    
    this.emit('completed', {
      rotationCount: this.rotationCount,
      finalScore: finalScore,
      metrics: {
        tempoAccuracy: this.tempoAccuracy,
        circularity: this.circularityScore,
        avgBPM: this.currentBPM
      }
    });
    
    console.log(`[HeartOfFrost] Exercice terminé! Score: ${finalScore}%`);
  }

  /**
   * Joue un feedback audio de fin d'exercice
   */
  playCompletionFeedback() {
    if (!this.audioConnected) return;
    
    try {
      // Séquence audio de fin d'exercice
      if (typeof window.audioSystem.setPlaybackRate === 'function') {
        window.audioSystem.setPlaybackRate(1.2); // Légère accélération
      }
      
      if (typeof window.audioSystem.setVolume === 'function') {
        window.audioSystem.setVolume(0.9); // Volume élevé
      }
      
      // Revenir aux paramètres normaux après 2 secondes
      setTimeout(() => {
        if (typeof window.audioSystem.setPlaybackRate === 'function') {
          window.audioSystem.setPlaybackRate(1.0);
        }
        if (typeof window.audioSystem.setVolume === 'function') {
          window.audioSystem.setVolume(0.7);
        }
      }, 2000);
      
    } catch (error) {
      console.error('[HeartOfFrost] Erreur lors du feedback de fin:', error);
    }
  }

  /**
   * Calcule le score final
   */
  calculateFinalScore() {
    // 40% tempo, 40% circularité, 20% bonus de completion
    const completionBonus = this.rotationCount >= this.targetRotations ? 0.2 : 0;
    const score = (this.tempoAccuracy * 0.4 + this.circularityScore * 0.4 + completionBonus) * 100;
    return Math.round(Math.min(100, score));
  }

  /**
   * Arrête l'exercice
   */
  stop() {
    this.isActive = false;
    
    // Réinitialiser les paramètres audio
    this.initializeAudioSettings();
    
    this.emit('stopped');
  }

  /**
   * Génère les paramètres audio pour le feedback rythmique
   * Version améliorée avec des effets plus prononcés
   */
  getAudioParameters() {
    // Paramètres de base
    const baseSpeed = 1.0;
    const baseVolume = 0.7;
    
    // Calculs basés sur la performance
    const speedVariation = (1 - this.tempoAccuracy) * 1.2; // Variation plus marquée
    const volumeVariation = this.circularityScore * 0.4; // Volume basé sur la circularité
    
    // Direction basée sur la précision du tempo
    const direction = this.tempoAccuracy < 0.4 ? -1 : 1;
    
    // Position dans le cycle de rotation
    const rotationProgress = Math.abs(this.totalAngle) / (2 * Math.PI);
    const progressInCycle = rotationProgress % 1;
    
    // Calculs avancés
    const speedMultiplier = 1 + (Math.sin(progressInCycle * Math.PI * 2) * speedVariation);
    const finalSpeed = direction * baseSpeed * speedMultiplier;
    
    // Volume avec pulsation douce
    const volumePulsation = Math.sin(progressInCycle * Math.PI * 4) * 0.1;
    const finalVolume = Math.max(0.1, Math.min(1.0, baseVolume + volumeVariation + volumePulsation));
    
    return {
      speed: finalSpeed,
      volume: finalVolume,
      direction: direction,
      grainSize: 0.08 + (this.circularityScore * 0.25), // Grains plus variés
      overlap: 0.75 + (this.tempoAccuracy * 0.2) // Overlap plus variable
    };
  }

  /**
   * Obtient les statistiques de performance
   */
  getPerformanceStats() {
    return {
      rotationCount: this.rotationCount,
      targetRotations: this.targetRotations,
      currentBPM: this.currentBPM,
      targetBPM: this.targetBPM,
      tempoAccuracy: this.tempoAccuracy,
      circularityScore: this.circularityScore,
      audioConnected: this.audioConnected,
      rotationHistory: this.rotationHistory,
      isActive: this.isActive
    };
  }
}

module.exports = HeartOfFrostExercise;