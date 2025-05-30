/**
 * Module de contrôle audio pour l'onglet Rita's Adventure
 * Version améliorée avec meilleure détection du système audio
 */

const { EventEmitter } = require('events');

// Émetteur d'événements pour la communication avec d'autres modules
const audioControlEvents = new EventEmitter();

// Variables globales pour la gestion d'état
let audioSystemCheckInterval = null;
let retryCount = 0;
const maxRetries = 10;

/**
 * Crée et initialise les contrôles audio dans l'onglet narratif
 * @param {HTMLElement} container - Conteneur pour les contrôles audio
 */
function createAudioControls(container) {
    if (!container) {
        console.error('[AudioControls] Conteneur non spécifié');
        return false;
    }
    
    console.log('[AudioControls] Création des contrôles audio...');
    
    // Créer le conteneur pour les contrôles audio
    const audioControlsContainer = document.createElement('div');
    audioControlsContainer.className = 'audio-controls-narrative';
    
    // Ajouter le contenu HTML
    audioControlsContainer.innerHTML = `
        <div class="audio-upload-section">
            <h3>🎵 Contrôles Audio pour les Exercices</h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
                Chargez un fichier audio qui sera utilisé comme base pour les exercices interactifs.
            </p>
            <div class="file-upload-container">
                <label for="narrativeAudioFile" class="custom-file-upload">
                    <i class="fas fa-music"></i> Choisir un fichier audio
                </label>
                <input type="file" id="narrativeAudioFile" accept="audio/*" />
                <span id="narrativeFileName">Aucun fichier sélectionné</span>
            </div>
            <div class="audio-controls-basic">
                <button id="narrativePlayPauseButton" class="control-button" disabled>
                    <span class="play-icon">▶</span>
                    <span class="pause-icon" style="display: none;">⏸</span>
                </button>
                <button id="narrativeStopButton" class="control-button" disabled style="background-color: #f44336;">
                    <span>⏹</span>
                </button>
                <div class="volume-control">
                    <span id="narrativeVolumeDisplay">Volume: 100%</span>
                </div>
                <div class="loop-control">
                    <label>
                        <input type="checkbox" id="narrativeLoopCheckbox" checked>
                        Mode boucle (recommandé pour les exercices)
                    </label>
                </div>
            </div>
            <div class="audio-status" id="narrativeAudioStatus">
                <span style="color: #ff9800;">Vérification du système audio...</span>
            </div>
            <div class="debug-info" id="narrativeDebugInfo" style="font-size: 12px; color: #999; margin-top: 10px;">
                Initialisation en cours...
            </div>
        </div>
    `;
    
    // Ajouter le conteneur au DOM
    container.insertBefore(audioControlsContainer, container.firstChild);
    
    // Démarrer la vérification du système audio
    startAudioSystemCheck();
    
    // Configurer les écouteurs d'événements après un court délai
    setTimeout(() => {
        setupEventListeners();
    }, 500);
    
    console.log('[AudioControls] Interface créée, vérification du système audio...');
    audioControlEvents.emit('audioControlsInitialized');
    
    return true;
}

/**
 * Démarre la vérification périodique du système audio
 */
function startAudioSystemCheck() {
    const debugInfo = document.getElementById('narrativeDebugInfo');
    const audioStatus = document.getElementById('narrativeAudioStatus');
    
    // Fonction de vérification
    const checkAudioSystem = () => {
        retryCount++;
        
        if (debugInfo) {
            debugInfo.textContent = `Tentative ${retryCount}/${maxRetries} - Recherche du système audio...`;
        }
        
        console.log(`[AudioControls] Vérification ${retryCount}/${maxRetries} du système audio`);
        
        // Vérifier si le système audio est disponible
        if (window.audioSystem) {
            console.log('[AudioControls] Système audio détecté !');
            
            if (debugInfo) {
                debugInfo.textContent = '✓ Système audio détecté';
                debugInfo.style.color = '#4caf50';
            }
            
            if (audioStatus) {
                audioStatus.innerHTML = '<span style="color: #4caf50;">✓ Système audio disponible</span>';
            }
            
            // Arrêter la vérification
            if (audioSystemCheckInterval) {
                clearInterval(audioSystemCheckInterval);
                audioSystemCheckInterval = null;
            }
            
            // Configurer les écouteurs d'événements audio
            setupAudioSystemEventListeners();
            
            // Synchroniser l'état
            synchronizeWithAudioSystem();
            
            return true;
        } else {
            console.warn(`[AudioControls] Système audio non trouvé (tentative ${retryCount})`);
            
            if (audioStatus) {
                audioStatus.innerHTML = `<span style="color: #f44336;">Système audio non disponible (${retryCount}/${maxRetries})</span>`;
            }
            
            // Arrêter après maxRetries tentatives
            if (retryCount >= maxRetries) {
                console.error('[AudioControls] Échec de la détection du système audio après', maxRetries, 'tentatives');
                
                if (debugInfo) {
                    debugInfo.textContent = '❌ Système audio non trouvé - Rechargez la page ou passez par l\'onglet "Sound Control"';
                    debugInfo.style.color = '#f44336';
                }
                
                if (audioStatus) {
                    audioStatus.innerHTML = '<span style="color: #f44336;">❌ Système audio non disponible</span>';
                }
                
                if (audioSystemCheckInterval) {
                    clearInterval(audioSystemCheckInterval);
                    audioSystemCheckInterval = null;
                }
                
                return false;
            }
        }
        
        return false;
    };
    
    // Vérification immédiate
    if (!checkAudioSystem()) {
        // Si pas trouvé, vérifier toutes les secondes
        audioSystemCheckInterval = setInterval(() => {
            checkAudioSystem();
        }, 1000);
    }
}

/**
 * Configure les écouteurs d'événements pour les contrôles audio
 */
function setupEventListeners() {
    console.log('[AudioControls] Configuration des écouteurs d\'événements...');
    
    const audioFileInput = document.getElementById('narrativeAudioFile');
    const fileNameSpan = document.getElementById('narrativeFileName');
    const playPauseButton = document.getElementById('narrativePlayPauseButton');
    const stopButton = document.getElementById('narrativeStopButton');
    const loopCheckbox = document.getElementById('narrativeLoopCheckbox');
    const audioStatus = document.getElementById('narrativeAudioStatus');
    const playIcon = playPauseButton ? playPauseButton.querySelector('.play-icon') : null;
    const pauseIcon = playPauseButton ? playPauseButton.querySelector('.pause-icon') : null;
    
    // Gestionnaire pour le chargement de fichier
    if (audioFileInput) {
        audioFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                console.log('[AudioControls] Nouveau fichier sélectionné:', file.name);
                
                // Vérifier le système audio avant de charger
                if (!window.audioSystem) {
                    console.error('[AudioControls] Système audio non disponible pour le chargement');
                    audioStatus.innerHTML = '<span style="color: #f44336;">❌ Système audio non disponible</span>';
                    return;
                }
                
                // Mettre à jour l'interface
                fileNameSpan.textContent = file.name;
                audioStatus.innerHTML = `<span style="color: #ff9800;">Chargement de ${file.name}...</span>`;
                
                // Charger le fichier audio via le système audio global
                try {
                    if (typeof window.audioSystem.loadAudioFile === 'function') {
                        console.log('[AudioControls] Chargement via le système audio global');
                        window.audioSystem.loadAudioFile(file);
                        
                        // Émettre un événement
                        audioControlEvents.emit('audioFileSelected', {
                            fileName: file.name,
                            fileSize: file.size,
                            fileType: file.type
                        });
                    } else {
                        throw new Error('Méthode loadAudioFile non disponible');
                    }
                } catch (error) {
                    console.error('[AudioControls] Erreur lors du chargement:', error);
                    audioStatus.innerHTML = `<span style="color: #f44336;">Erreur: ${error.message}</span>`;
                }
            }
        });
    }
    
    // Gestionnaire pour le bouton play/pause
    if (playPauseButton) {
        playPauseButton.addEventListener('click', () => {
            console.log('[AudioControls] Clic sur play/pause');
            
            if (!window.audioSystem) {
                console.error('[AudioControls] Système audio non disponible');
                return;
            }
            
            try {
                let isPlaying = false;
                
                if (typeof window.audioSystem.togglePlayPause === 'function') {
                    isPlaying = window.audioSystem.togglePlayPause();
                    console.log('[AudioControls] togglePlayPause appelé, isPlaying:', isPlaying);
                } else if (typeof window.audioSystem.isPlaybackActive === 'function' && 
                          typeof window.audioSystem.startPlayback === 'function' &&
                          typeof window.audioSystem.stopPlayback === 'function') {
                    // Méthode alternative
                    if (window.audioSystem.isPlaybackActive()) {
                        window.audioSystem.stopPlayback();
                        isPlaying = false;
                        console.log('[AudioControls] Lecture arrêtée manuellement');
                    } else {
                        window.audioSystem.startPlayback();
                        isPlaying = true;
                        console.log('[AudioControls] Lecture démarrée manuellement');
                    }
                } else {
                    throw new Error('Aucune méthode de contrôle de lecture disponible');
                }
                
                // Mettre à jour l'interface
                updatePlayPauseButton(isPlaying);
                
                // Émettre un événement
                audioControlEvents.emit('playbackStateChanged', { isPlaying });
                
            } catch (error) {
                console.error('[AudioControls] Erreur lors du contrôle de lecture:', error);
                audioStatus.innerHTML = `<span style="color: #f44336;">Erreur: ${error.message}</span>`;
            }
        });
    }
    
    // Gestionnaire pour le bouton stop
    if (stopButton) {
        stopButton.addEventListener('click', () => {
            console.log('[AudioControls] Clic sur stop');
            
            if (window.audioSystem && typeof window.audioSystem.stopPlayback === 'function') {
                try {
                    window.audioSystem.stopPlayback();
                    updatePlayPauseButton(false);
                    audioStatus.innerHTML = '<span style="color: #666;">⏹ Lecture arrêtée</span>';
                    console.log('[AudioControls] Lecture arrêtée');
                } catch (error) {
                    console.error('[AudioControls] Erreur lors de l\'arrêt:', error);
                }
            }
        });
    }
    
    // Gestionnaire pour la case à cocher boucle
    if (loopCheckbox) {
        loopCheckbox.addEventListener('change', () => {
            console.log('[AudioControls] Changement mode boucle:', loopCheckbox.checked);
            
            if (window.audioSystem && typeof window.audioSystem.setLoopPlayback === 'function') {
                try {
                    window.audioSystem.setLoopPlayback(loopCheckbox.checked);
                    console.log('[AudioControls] Mode boucle mis à jour');
                } catch (error) {
                    console.error('[AudioControls] Erreur lors du changement de mode boucle:', error);
                }
            }
        });
    }
    
    console.log('[AudioControls] Écouteurs d\'événements configurés');
}

/**
 * Met à jour l'état du bouton play/pause
 */
function updatePlayPauseButton(isPlaying) {
    const playIcon = document.querySelector('#narrativePlayPauseButton .play-icon');
    const pauseIcon = document.querySelector('#narrativePlayPauseButton .pause-icon');
    const audioStatus = document.getElementById('narrativeAudioStatus');
    
    if (playIcon && pauseIcon) {
        if (isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'inline';
        } else {
            playIcon.style.display = 'inline';
            pauseIcon.style.display = 'none';
        }
    }
    
    if (audioStatus) {
        if (isPlaying) {
            audioStatus.innerHTML = '<span style="color: #4caf50;">▶ Lecture en cours</span>';
        } else {
            audioStatus.innerHTML = '<span style="color: #ff9800;">⏸ Lecture en pause</span>';
        }
    }
}

/**
 * Configure les écouteurs d'événements du système audio
 */
function setupAudioSystemEventListeners() {
    if (!window.audioSystem || !window.audioSystem.audioEvents) {
        console.warn('[AudioControls] AudioEvents non disponible');
        return;
    }
    
    console.log('[AudioControls] Configuration des écouteurs d\'événements audio...');
    
    const volumeDisplay = document.getElementById('narrativeVolumeDisplay');
    const audioStatus = document.getElementById('narrativeAudioStatus');
    const playPauseButton = document.getElementById('narrativePlayPauseButton');
    const stopButton = document.getElementById('narrativeStopButton');
    const fileNameSpan = document.getElementById('narrativeFileName');
    
    // Événements du système audio
    try {
        // Mise à jour du volume
        window.audioSystem.audioEvents.on('volumeChanged', (data) => {
            console.log('[AudioControls] Événement volumeChanged:', data);
            if (volumeDisplay) {
                volumeDisplay.textContent = `Volume: ${Math.round(data.volume * 100)}%`;
            }
        });
        
        // Mise à jour de l'état de lecture
        window.audioSystem.audioEvents.on('playbackStateChanged', (data) => {
            console.log('[AudioControls] Événement playbackStateChanged:', data);
            updatePlayPauseButton(data.isPlaying);
        });
        
        // Fichier audio chargé
        window.audioSystem.audioEvents.on('audioFileLoaded', (data) => {
            console.log('[AudioControls] Événement audioFileLoaded:', data);
            
            if (playPauseButton) playPauseButton.disabled = false;
            if (stopButton) stopButton.disabled = false;
            if (fileNameSpan && !fileNameSpan.textContent.includes(data.fileName)) {
                fileNameSpan.textContent = data.fileName;
            }
            if (audioStatus) {
                audioStatus.innerHTML = `<span style="color: #4caf50;">✓ ${data.fileName} chargé (${data.duration.toFixed(1)}s)</span>`;
            }
            
            // Activer automatiquement le mode boucle
            const loopCheckbox = document.getElementById('narrativeLoopCheckbox');
            if (loopCheckbox && loopCheckbox.checked && 
                window.audioSystem && typeof window.audioSystem.setLoopPlayback === 'function') {
                window.audioSystem.setLoopPlayback(true);
                console.log('[AudioControls] Mode boucle activé automatiquement');
            }
        });
        
        // Erreur de chargement
        window.audioSystem.audioEvents.on('audioFileError', (data) => {
            console.error('[AudioControls] Erreur de chargement audio:', data);
            if (audioStatus) {
                audioStatus.innerHTML = `<span style="color: #f44336;">❌ Erreur: ${data.error}</span>`;
            }
        });
        
        // Fin de lecture
        window.audioSystem.audioEvents.on('playbackEnded', () => {
            console.log('[AudioControls] Fin de lecture');
            updatePlayPauseButton(false);
            if (audioStatus) {
                audioStatus.innerHTML = '<span style="color: #666;">⏹ Lecture terminée</span>';
            }
        });
        
        console.log('[AudioControls] Écouteurs d\'événements audio configurés avec succès');
        
    } catch (error) {
        console.error('[AudioControls] Erreur lors de la configuration des écouteurs audio:', error);
    }
}

/**
 * Force la synchronisation avec le système audio
 */
function synchronizeWithAudioSystem() {
    if (!window.audioSystem) {
        console.warn('[AudioControls] Système audio non disponible pour la synchronisation');
        return;
    }
    
    console.log('[AudioControls] Synchronisation avec le système audio...');
    
    try {
        // Vérifier l'état actuel du système audio
        const hasAudio = window.audioSystem.isAudioBufferLoaded ? window.audioSystem.isAudioBufferLoaded() : false;
        const isPlaying = window.audioSystem.isPlaybackActive ? window.audioSystem.isPlaybackActive() : false;
        
        console.log('[AudioControls] État synchronisé - hasAudio:', hasAudio, 'isPlaying:', isPlaying);
        
        // Mettre à jour les contrôles
        const playPauseButton = document.getElementById('narrativePlayPauseButton');
        const stopButton = document.getElementById('narrativeStopButton');
        const audioStatus = document.getElementById('narrativeAudioStatus');
        
        if (playPauseButton) playPauseButton.disabled = !hasAudio;
        if (stopButton) stopButton.disabled = !hasAudio;
        
        updatePlayPauseButton(isPlaying);
        
        if (audioStatus) {
            if (hasAudio) {
                audioStatus.innerHTML = isPlaying ? 
                    '<span style="color: #4caf50;">▶ Lecture en cours</span>' : 
                    '<span style="color: #ff9800;">Prêt à lire</span>';
            } else {
                audioStatus.innerHTML = '<span style="color: #4caf50;">✓ Système audio disponible</span>';
            }
        }
        
    } catch (error) {
        console.error('[AudioControls] Erreur lors de la synchronisation:', error);
    }
}

/**
 * Met à jour l'état des contrôles audio
 * @param {Object} state - État actuel du système audio
 */
function updateControlsState(state) {
    const playPauseButton = document.getElementById('narrativePlayPauseButton');
    const stopButton = document.getElementById('narrativeStopButton');
    const volumeDisplay = document.getElementById('narrativeVolumeDisplay');
    const audioStatus = document.getElementById('narrativeAudioStatus');
    const loopCheckbox = document.getElementById('narrativeLoopCheckbox');
    
    if (state.hasFile) {
        if (playPauseButton) playPauseButton.disabled = false;
        if (stopButton) stopButton.disabled = false;
    } else {
        if (playPauseButton) playPauseButton.disabled = true;
        if (stopButton) stopButton.disabled = true;
    }
    
    if (state.volume !== undefined && volumeDisplay) {
        volumeDisplay.textContent = `Volume: ${Math.round(state.volume * 100)}%`;
    }
    
    if (state.isLooping !== undefined && loopCheckbox) {
        loopCheckbox.checked = state.isLooping;
    }
    
    if (state.status && audioStatus) {
        audioStatus.innerHTML = state.status;
    }
}

// Exporter les fonctions et objets du module
module.exports = {
    createAudioControls,
    updateControlsState,
    synchronizeWithAudioSystem,
    audioControlEvents
};