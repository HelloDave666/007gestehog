const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// Amélioration des logs visuels
let visualLogContainer = null;

/**
 * Système de log amélioré avec affichage visuel
 */
function setupLogging() {
    // Code original pour la surcharge des fonctions console.log, console.error, etc.
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Remplacer console.log pour capturer et relayer les logs
    console.log = function() {
        // Exécuter le comportement original
        originalConsoleLog.apply(console, arguments);
        
        // Formater le message
        const message = Array.from(arguments).join(' ');
        
        // Envoyer au processus principal
        ipcRenderer.send('log', { level: 'INFO', message });
        
        // Ajouter au log visuel si disponible
        if (window.addLogMessage) {
            window.addLogMessage('INFO', message);
        }
    };
    
    // Remplacer console.error
    console.error = function() {
        // Exécuter le comportement original
        originalConsoleError.apply(console, arguments);
        
        // Formater le message
        const message = Array.from(arguments).join(' ');
        
        // Envoyer au processus principal
        ipcRenderer.send('log', { level: 'ERROR', message });
        
        // Ajouter au log visuel si disponible
        if (window.addLogMessage) {
            window.addLogMessage('ERROR', message);
        }
    };
    
    // Remplacer console.warn
    console.warn = function() {
        // Exécuter le comportement original
        originalConsoleWarn.apply(console, arguments);
        
        // Formater le message
        const message = Array.from(arguments).join(' ');
        
        // Envoyer au processus principal
        ipcRenderer.send('log', { level: 'WARN', message });
        
        // Ajouter au log visuel si disponible
        if (window.addLogMessage) {
            window.addLogMessage('WARN', message);
        }
    };
}

/**
 * Crée un log visuel dans l'interface
 */
function createVisualLog() {
    // Ne rien faire si un log visuel existe déjà
    if (document.getElementById('visual-log-container')) return;
    
    // Créer le conteneur de log flottant
    visualLogContainer = document.createElement('div');
    visualLogContainer.id = 'visual-log-container';
    visualLogContainer.style.position = 'fixed';
    visualLogContainer.style.bottom = '10px';
    visualLogContainer.style.right = '10px';
    visualLogContainer.style.width = '300px';
    visualLogContainer.style.maxHeight = '200px';
    visualLogContainer.style.overflow = 'auto';
    visualLogContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    visualLogContainer.style.color = 'white';
    visualLogContainer.style.padding = '10px';
    visualLogContainer.style.borderRadius = '5px';
    visualLogContainer.style.fontSize = '12px';
    visualLogContainer.style.fontFamily = 'monospace';
    visualLogContainer.style.zIndex = '9999';
    visualLogContainer.style.display = 'none'; // Caché par défaut
    
    // Bouton pour afficher/masquer les logs
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Logs';
    toggleButton.style.position = 'fixed';
    toggleButton.style.bottom = '10px';
    toggleButton.style.right = '10px';
    toggleButton.style.padding = '5px 10px';
    toggleButton.style.backgroundColor = '#4CAF50';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.borderRadius = '3px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.zIndex = '10000';
    
    // Gestionnaire pour afficher/masquer
    toggleButton.addEventListener('click', () => {
        const isVisible = visualLogContainer.style.display !== 'none';
        visualLogContainer.style.display = isVisible ? 'none' : 'block';
        toggleButton.textContent = isVisible ? 'Logs' : 'Masquer';
    });
    
    // Ajouter les éléments au DOM
    document.body.appendChild(visualLogContainer);
    document.body.appendChild(toggleButton);
    
    // Fonction pour ajouter un message de log
    window.addLogMessage = function(level, message) {
        const logEntry = document.createElement('div');
        logEntry.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        logEntry.style.paddingBottom = '5px';
        logEntry.style.marginBottom = '5px';
        
        // Colorer selon le niveau
        if (level === 'ERROR') {
            logEntry.style.color = '#ff5252';
        } else if (level === 'WARN') {
            logEntry.style.color = '#ffd740';
        }
        
        // Timestamp + message
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        // Ajouter au conteneur
        visualLogContainer.appendChild(logEntry);
        
        // Scroller en bas
        visualLogContainer.scrollTop = visualLogContainer.scrollHeight;
        
        // Limiter le nombre d'entrées
        while (visualLogContainer.children.length > 50) {
            visualLogContainer.removeChild(visualLogContainer.firstChild);
        }
    };
}

// État global de l'application
window.appState = {
    audioReady: false,
    bluetoothReady: false,
    narrativeReady: false
};

// Gestionnaires d'événements pour les onglets
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Fonction pour activer un onglet
    function activateTab(tabId) {
        // Désactiver tous les onglets
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Activer l'onglet sélectionné
        const selectedTab = document.querySelector(`[data-tab="${tabId}"]`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }
        
        // Déclencher un événement de changement d'onglet
        document.dispatchEvent(new CustomEvent('tabChanged', { 
            detail: { tabId }
        }));
    }
    
    // Ajouter les écouteurs d'événements aux boutons d'onglets
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            activateTab(tabId);
        });
    });
    
    // S'assurer que le premier onglet est activé au démarrage
    activateTab('mainTab');
}

/**
 * Initialise les modules de l'application de manière différée
 */
function setupDeferredModuleLoading() {
    document.addEventListener('tabChanged', (event) => {
        const { tabId } = event.detail;
        
        switch (tabId) {
            case 'bluetoothTab':
                console.log('[App] Chargement du module Bluetooth');
                loadBluetoothModule();
                break;
                
            case 'soundTab':
                console.log('[App] Chargement du module Audio');
                loadAudioModule();
                // Supprimer les contrôles audio de l'onglet Sound
                setTimeout(() => {
                    completelySuppressSoundTabAudioControls();
                }, 500);
                break;
                
            case 'mainTab':
                console.log('[App] Chargement du module Narratif');
                loadNarrativeModule();
                break;
        }
    });
}

/**
 * Supprime complètement et définitivement tous les contrôles audio de l'onglet Sound Control
 * tout en préservant la sensibilité des capteurs et les réglages avancés
 * et réorganise les éléments conservés
 */
function completelySuppressSoundTabAudioControls() {
    try {
        console.log("[App] Suppression des contrôles audio dans l'onglet Sound Control");
        
        const soundTab = document.getElementById('soundTab');
        if (!soundTab) {
            console.log('[App] Onglet Sound Control non trouvé');
            return;
        }
        
        // Éléments à supprimer (sélection précise)
        const elementsToRemove = [
            // Sélection de fichier audio
            '.file-upload-container',
            '.file-selector',
            'input[type="file"]',
            'label[for="audioFile"]',
            '#fileNameDisplay',
            
            // Contrôles de lecture
            '#playPauseButton',
            '#stopButton',
            '.play-controls',
            '.playback-controls',
            
            // Affichage de position et timeline
            '#timelineContainer',
            '#timelineProgress',
            '#timelineHandle',
            '#positionDisplay',
            
            // Autres éléments liés à la lecture
            '#loopCheckbox',
            'label[for="loopCheckbox"]',
            '.loop-checkbox-container',
            
            // Contrôles d'enregistrement
            '#recordButton',
            '.record-button',
            '#recordingStatus',
            
            // Statut audio
            '#audioStatus',
            '.audio-status',
            
            // Messages informatifs existants
            '.audio-moved-message',
            '.audio-info-message',
            
            // Indicateurs de vitesse et volume
            '#speedDisplay',
            '#volumeDisplay',
            '.speed-display',
            '.volume-display',
            '.speed-control',
            '.volume-control',
            'div[id*="speed"]',
            'div[id*="volume"]',
            'div[id*="vitesse"]',
            'span[id*="speed"]',
            'span[id*="volume"]'
        ];
        
        // Supprimer chaque élément correspondant
        elementsToRemove.forEach(selector => {
            const elements = soundTab.querySelectorAll(selector);
            elements.forEach(element => {
                console.log("[App] Suppression de l'élément: " + selector);
                element.remove();
            });
        });
        
        // Rechercher et supprimer les conteneurs qui contiennent ces éléments
        const containers = soundTab.querySelectorAll('.controls-container, .audio-controls-container, .file-controls');
        containers.forEach(container => {
            // Ne supprimer le conteneur que s'il ne contient pas les éléments à conserver
            const hasSensitivityControls = container.querySelector('#sensitivitySlider, #sensitivityValue');
            const hasAdvancedControls = container.querySelector('#grainSizeInput, #overlapInput, #windowTypeSelect');
            
            if (!hasSensitivityControls && !hasAdvancedControls) {
                console.log("[App] Suppression d'un conteneur de contrôles audio");
                container.remove();
            }
        });
        
        // Supprimer également les textes de vitesse et volume par recherche de texte
        const allElements = soundTab.querySelectorAll('*');
        allElements.forEach(element => {
            const text = element.textContent || '';
            if (text.includes('Vitesse:') || 
                text.includes('Volume:') || 
                text.includes('vitesse') || 
                text.includes('volume') ||
                text.includes('Speed:') ||
                text.includes('speed')) {
                // Vérifier qu'il ne s'agit pas d'un élément de sensibilité ou paramètres avancés
                const isPartOfSensitivity = element.closest('.sensitivity-controls');
                const isPartOfAdvanced = element.closest('.advanced-controls');
                if (!isPartOfSensitivity && !isPartOfAdvanced) {
                    console.log("[App] Suppression d'élément texte:", text.substring(0, 50));
                    element.remove();
                }
            }
        });
        
        // Réorganiser les éléments conservés pour les placer en haut de la page
        const sensitivitySection = soundTab.querySelector('.sensitivity-section, .sensitivity-controls');
        const advancedSection = soundTab.querySelector('.advanced-section, .advanced-controls, .advanced-parameters');
        
        if (sensitivitySection && advancedSection) {
            // Créer un nouveau conteneur pour les regrouper
            const newContainer = document.createElement('div');
            newContainer.className = 'sound-controls-container';
            newContainer.style.marginTop = '20px';
            
            // Cloner les sections pour les déplacer
            const sensitivityClone = sensitivitySection.cloneNode(true);
            const advancedClone = advancedSection.cloneNode(true);
            
            // Ajouter au nouveau conteneur
            newContainer.appendChild(sensitivityClone);
            newContainer.appendChild(advancedClone);
            
            // Insérer en haut de l'onglet
            if (soundTab.firstChild) {
                soundTab.insertBefore(newContainer, soundTab.firstChild);
            } else {
                soundTab.appendChild(newContainer);
            }
            
            // Supprimer les sections d'origine
            sensitivitySection.remove();
            advancedSection.remove();
            
            console.log("[App] Réorganisation des contrôles terminée");
        }
        
        console.log("[App] Suppression des contrôles audio terminée");
        
    } catch (error) {
        console.error('[App] Erreur lors de la suppression des contrôles audio:', error);
    }
}

/**
 * Vérifie si un objet audioContext est valide
 */
function isAudioContextValid(ctx) {
    return ctx && typeof ctx === 'object' && typeof ctx.resume === 'function';
}

/**
 * Tente d'activer le contexte audio s'il existe
 */
function safeResumeAudioContext() {
    try {
        if (window.audioSystem && window.audioSystem.audioContext) {
            const ctx = window.audioSystem.audioContext;
            if (isAudioContextValid(ctx) && ctx.state === 'suspended') {
                ctx.resume().then(() => {
                    console.log('[App] Contexte audio activé avec succès');
                }).catch(err => {
                    console.warn('[App] Erreur lors de l\'activation du contexte audio:', err);
                });
            }
        }
    } catch (error) {
        console.error('[App] Erreur lors de la tentative d\'activation audio:', error);
    }
}

/**
 * Charge le module Bluetooth avec vérification de sécurité
 */
function loadBluetoothModule() {
    try {
        // Vérifier si le module est déjà chargé
        if (window.bluetoothModuleLoaded) return;
        
        // Détection du chemin de base de l'application
        const appRoot = path.resolve(process.cwd());
        console.log('[Debug] Chemin racine de l\'application:', appRoot);
        
        // Chemin absolu vers le module Bluetooth
        const modulePath = path.join(appRoot, 'src', 'renderer', 'bluetooth', 'bluetoothManager.js');
        console.log('[Debug] Tentative de chargement du module à:', modulePath);
        
        // Vérifier si le fichier existe
        if (fs.existsSync(modulePath)) {
            console.log('[Debug] Le fichier existe, tentative de chargement');
            const bluetooth = require(modulePath);
            
            // Initialiser le module
            bluetooth.initBluetoothSystem();
            
            // Stocker une référence globale pour les autres modules
            window.bluetoothModule = bluetooth;
            
            // Écouter les événements du module Bluetooth
            setupBluetoothEvents(bluetooth);
            
            // Marquer le module comme chargé
            window.bluetoothModuleLoaded = true;
            window.appState.bluetoothReady = true;
            
            console.log('[App] Module Bluetooth chargé avec succès');
        } else {
            throw new Error(`Le fichier ${modulePath} n'existe pas`);
        }
    } catch (error) {
        console.error('[App] Erreur lors du chargement du module Bluetooth:', error);
        // Afficher une notification visuelle de l'erreur
        if (window.addLogMessage) {
            window.addLogMessage('ERROR', `Erreur Bluetooth: ${error.message}`);
        }
    }
}

/**
 * Configure les écouteurs d'événements pour le module Bluetooth
 * @param {object} bluetooth - Module Bluetooth
 */
function setupBluetoothEvents(bluetooth) {
    // Événement lorsque les deux capteurs sont prêts
    bluetooth.bluetoothEvents.on('bothSensorsReady', (data) => {
        console.log('[App] Les deux capteurs sont prêts:', data);
        
        // Si le module audio est chargé, notifier
        if (window.appState.audioReady && window.audioSystem) {
            window.addLogMessage('INFO', 'Capteurs prêts pour le contrôle audio');
            
            // Tenter d'activer l'audio sans l'appeler directement
            setTimeout(() => {
                safeResumeAudioContext();
            }, 500);
        }
    });
    
    // Événement lorsque les données des capteurs sont mises à jour
    bluetooth.bluetoothEvents.on('sensorDataUpdated', (data) => {
        // Si le module audio est chargé ET prêt
        if (window.appState.audioReady && window.audioSystem && 
            typeof window.audioSystem.updateFromSensors === 'function') {
            
            try {
                // Transmettre au système audio de façon sécurisée
                window.audioSystem.updateFromSensors({
                    leftSensor: data.leftSensor,
                    rightSensor: data.rightSensor,
                    jumpProtectionActive: data.jumpProtectionActive
                });
                
                // Log visuel périodique (limité pour éviter de spammer)
                if (Math.random() < 0.003 && window.addLogMessage) {
                    window.addLogMessage('INFO', 
                        `Capteurs: G(y:${data.leftSensor.y.toFixed(1)}°) D(y:${data.rightSensor.y.toFixed(1)}°)`);
                }
            } catch (err) {
                // Ignorer les erreurs occasionnelles pour éviter de bloquer le système
                console.warn('[App] Erreur temporaire sensor:', err.message);
            }
        }
    });
    
    // Événement lorsqu'un appareil est déconnecté
    bluetooth.bluetoothEvents.on('deviceDisconnected', (data) => {
        console.log('[App] Appareil déconnecté:', data);
        if (window.addLogMessage) {
            window.addLogMessage('WARN', `Capteur ${data.isLeft ? 'gauche' : 'droit'} déconnecté`);
        }
    });
    
    // Événement lorsque l'animation est démarrée ou arrêtée
    bluetooth.bluetoothEvents.on('animationLoopStarted', () => {
        console.log('[App] Boucle d\'animation démarrée');
    });
    
    bluetooth.bluetoothEvents.on('animationLoopStopped', () => {
        console.log('[App] Boucle d\'animation arrêtée');
    });
}

/**
 * Charge le module Audio avec vérification de sécurité
 */
function loadAudioModule() {
    try {
        // Vérifier si le module est déjà chargé
        if (window.audioModuleLoaded) {
            console.log('[App] Module audio déjà chargé');
            return;
        }
        
        // Détection du chemin de base de l'application
        const appRoot = path.resolve(process.cwd());
        console.log('[Debug] Chargement du module audio...');
        
        // Chemin absolu vers le module Audio
        const modulePath = path.join(appRoot, 'src', 'renderer', 'audio', 'audioSystem.js');
        console.log('[Debug] Tentative de chargement du module audio à:', modulePath);
        
        // Vérifier si le fichier existe
        if (fs.existsSync(modulePath)) {
            console.log('[Debug] Le fichier audio existe, tentative de chargement');
            const audioSystem = require(modulePath);
            
            // Créer une référence globale avant d'initialiser
            window.audioSystem = audioSystem;
            
            // Écouter les événements du module audio
            setupAudioEvents(audioSystem);
            
            // Initialiser le module
            audioSystem.initAudioSystem();
            
            // Marquer le module comme chargé
            window.audioModuleLoaded = true;
            
            // Marquer comme prêt seulement après que tout est complètement chargé
            window.appState.audioReady = true;
            
            console.log('[App] Module Audio chargé avec succès');
            
            // Connexion avec le module Bluetooth si déjà chargé
            if (window.bluetoothModuleLoaded && window.bluetoothModule) {
                console.log('[App] Connexion avec le module Bluetooth déjà chargé');
                if (window.addLogMessage) {
                    window.addLogMessage('INFO', 'Audio connecté aux capteurs Bluetooth');
                }
            }
        } else {
            throw new Error(`Le fichier ${modulePath} n'existe pas`);
        }
    } catch (error) {
        console.error('[App] Erreur lors du chargement du module Audio:', error);
        // Afficher une notification visuelle de l'erreur
        if (window.addLogMessage) {
            window.addLogMessage('ERROR', `Erreur Audio: ${error.message}`);
        }
    }
}

/**
 * Configure les écouteurs d'événements pour le module Audio
 * @param {object} audioSystem - Module Audio
 */
function setupAudioEvents(audioSystem) {
    // Événement lorsque le système audio est initialisé
    audioSystem.audioEvents.on('audioSystemInitialized', () => {
        console.log('[App] Système audio initialisé');
        // Marquer le système audio comme prêt
        window.appState.audioReady = true;
        
        // Tenter d'activer le contexte audio immédiatement
        setTimeout(safeResumeAudioContext, 500);
    });
    
    // Événement lorsqu'un fichier audio est chargé
    audioSystem.audioEvents.on('audioFileLoaded', (data) => {
        console.log('[App] Fichier audio chargé:', data.fileName);
        if (window.addLogMessage) {
            window.addLogMessage('INFO', `Fichier audio chargé: ${data.fileName} (${data.duration.toFixed(2)}s)`);
        }
        
        // Tenter d'activer le contexte audio après chargement de fichier
        safeResumeAudioContext();
    });
}

/**
 * Charge le module Narratif
 */
function loadNarrativeModule() {
    try {
        // Vérifier si le module est déjà chargé
        if (window.narrativeModuleLoaded) {
            console.log('[App] Module narratif déjà chargé');
            return;
        }
        
        // Détection du chemin de base de l'application
        const appRoot = path.resolve(process.cwd());
        console.log('[Debug] Chargement du module narratif...');
        
        // Chemin absolu vers le module Narratif
        const modulePath = path.join(appRoot, 'src', 'renderer', 'narrative', 'narrativeSystem.js');
        console.log('[Debug] Tentative de chargement du module narratif à:', modulePath);
        
        // Vérifier si le fichier existe
        if (fs.existsSync(modulePath)) {
            console.log('[Debug] Le fichier narratif existe, tentative de chargement');
            const narrativeSystem = require(modulePath);
            
            // Stocker une référence pour les autres modules
            window.narrativeSystem = narrativeSystem;
            
            // Obtenir le conteneur de l'onglet narratif
            const narrativeTab = document.getElementById('mainTab');
            
            if (narrativeTab) {
                // Initialiser le système narratif dans l'onglet principal
                narrativeSystem.initNarrativeSystem(narrativeTab);
                
                // Écouter les événements du module narratif
                setupNarrativeEvents(narrativeSystem);
                
                // Test rapide pour vérifier le fonctionnement
                setTimeout(() => narrativeSystem.testDialogue(), 1000);
            } else {
                console.error('[App] Onglet narratif non trouvé dans le DOM');
            }
            
            // Marquer le module comme chargé
            window.narrativeModuleLoaded = true;
            window.appState.narrativeReady = true;
            
            console.log('[App] Module Narratif chargé avec succès');
        } else {
            throw new Error(`Le fichier ${modulePath} n'existe pas`);
        }
    } catch (error) {
        console.error('[App] Erreur lors du chargement du module Narratif:', error);
        // Afficher une notification visuelle de l'erreur
        if (window.addLogMessage) {
            window.addLogMessage('ERROR', `Erreur Narratif: ${error.message}`);
        }
    }
}

/**
 * Configure les écouteurs d'événements pour le module Narratif
 * @param {object} narrativeSystem - Module Narratif
 */
function setupNarrativeEvents(narrativeSystem) {
    // Événement lorsque le système narratif est initialisé
    narrativeSystem.narrativeEvents.on('narrativeSystemInitialized', () => {
        console.log('[App] Système narratif initialisé');
        window.addLogMessage('INFO', 'Système narratif prêt');
    });
    
    // Événement lorsqu'une leçon est chargée
    narrativeSystem.narrativeEvents.on('lessonsLoaded', (lessons) => {
        console.log(`[App] ${lessons.length} leçons chargées`);
        window.addLogMessage('INFO', `${lessons.length} leçons narratives chargées`);
    });
    
    // Événement lorsqu'une leçon est démarrée
    narrativeSystem.narrativeEvents.on('lessonStarted', (lesson) => {
        console.log(`[App] Leçon démarrée: ${lesson.title}`);
        window.addLogMessage('INFO', `Leçon démarrée: ${lesson.title}`);
    });
    
    // Événement lorsqu'un exercice est démarré
    narrativeSystem.narrativeEvents.on('exerciseStarted', (exercise) => {
        console.log(`[App] Exercice démarré`);
        window.addLogMessage('INFO', `Exercice démarré: ${exercise.instructions}`);
        
        // Charger un fichier audio spécifique si spécifié dans l'exercice
        if (exercise.audioFile && window.audioSystem) {
            // Intégration avec le système audio existant
            console.log(`[App] Chargement du fichier audio pour l'exercice: ${exercise.audioFile}`);
        }
    });
    
    // Événement lorsqu'une leçon est terminée
    narrativeSystem.narrativeEvents.on('lessonCompleted', (lesson) => {
        console.log(`[App] Leçon terminée: ${lesson.title}`);
        window.addLogMessage('INFO', `Leçon terminée: ${lesson.title}`);
    });
    
    // Événement lorsqu'un dialogue est ajouté
    narrativeSystem.narrativeEvents.on('dialogueAdded', (data) => {
        console.log(`[App] Dialogue ajouté: ${data.speaker}`);
    });
    
    // Événement lorsqu'un dialogue est terminé
    narrativeSystem.narrativeEvents.on('dialogueEnded', () => {
        console.log('[App] Séquence de dialogue terminée');
    });
    
    // Événement lorsque l'animation du texte est terminée
    narrativeSystem.narrativeEvents.on('textAnimationCompleted', () => {
        console.log('[App] Animation du texte terminée');
    });
}

/**
 * Crée une fenêtre de dialogue globale et persistante
 * Version améliorée avec centrage et largeur adaptée
 */
function createPersistentDialogue() {
    // Vérifier si le conteneur existe déjà
    if (document.getElementById('persistent-dialogue-container')) return;
    
    // Créer le conteneur de dialogue persistant
    const dialogueContainer = document.createElement('div');
    dialogueContainer.id = 'persistent-dialogue-container';
    dialogueContainer.className = 'persistent-dialogue-container';
    
    // Appliquer les styles pour centrer et définir la largeur
    dialogueContainer.style.position = 'fixed';
    dialogueContainer.style.bottom = '20px';
    dialogueContainer.style.left = '0';
    dialogueContainer.style.right = '0';
    dialogueContainer.style.width = '80%'; // Largeur par défaut
    dialogueContainer.style.maxWidth = '800px'; // Largeur maximale pour grands écrans
    dialogueContainer.style.margin = '0 auto'; // Centrage horizontal
    dialogueContainer.style.zIndex = '1000'; // S'assurer qu'il est au-dessus des autres éléments
    
    // Ajouter au corps du document pour qu'il soit visible sur tous les onglets
    document.body.appendChild(dialogueContainer);
    
    // Initialiser le système de dialogue avec ce conteneur
    if (window.narrativeSystem && typeof window.narrativeSystem.dialogueSystem.setup === 'function') {
        window.narrativeSystem.dialogueSystem.setup(dialogueContainer);
        console.log('[App] Fenêtre de dialogue persistante créée');
    } else {
        // Planifier une tentative plus tard si le système narratif n'est pas encore chargé
        console.log('[App] Système narratif non disponible, dialogue persistant reporté');
        setTimeout(() => {
            if (window.narrativeSystem && typeof window.narrativeSystem.dialogueSystem.setup === 'function') {
                window.narrativeSystem.dialogueSystem.setup(dialogueContainer);
                console.log('[App] Fenêtre de dialogue persistante créée (différé)');
            }
        }, 2000);
    }
    
    // Ajuster la largeur en fonction de la taille de l'onglet
    function adjustDialogueWidth() {
        // Trouver l'onglet actif ou utiliser le premier onglet comme référence
        const activeTab = document.querySelector('.tab-content.active') || document.querySelector('.tab-content');
        
        if (activeTab) {
            // Récupérer la largeur de l'onglet
            const tabWidth = activeTab.clientWidth;
            
            // Appliquer une largeur proportionnelle à celle de l'onglet
            const newWidth = Math.min(tabWidth - 40, 800); // 20px de marge de chaque côté, max 800px
            dialogueContainer.style.width = `${newWidth}px`;
            
            console.log(`[App] Largeur du dialogue ajustée à ${newWidth}px (largeur onglet: ${tabWidth}px)`);
        }
    }
    
    // Ajuster la largeur au chargement
    setTimeout(adjustDialogueWidth, 500);
    
    // Réajuster la largeur lors du changement d'onglet
    document.addEventListener('tabChanged', adjustDialogueWidth);
    
    // Réajuster la largeur lors du redimensionnement de la fenêtre
    window.addEventListener('resize', adjustDialogueWidth);
}

/**
 * Charge le module de contrôles audio pour l'onglet narratif
 */
function loadAudioControlsModule() {
    try {
        // Vérifier si le module est déjà chargé
        if (window.audioControlsModuleLoaded) {
            console.log('[App] Module de contrôles audio déjà chargé');
            return;
        }
        
        // Détection du chemin de base de l'application
        const appRoot = path.resolve(process.cwd());
        console.log('[Debug] Chargement du module de contrôles audio...');
        
        // Chemin absolu vers le module AudioControls
        const modulePath = path.join(appRoot, 'src', 'renderer', 'narrative', 'audioControls.js');
        
        // Vérifier si le fichier existe
        if (fs.existsSync(modulePath)) {
            console.log('[Debug] Le fichier audioControls.js existe, tentative de chargement');
            const audioControls = require(modulePath);
            
            // Référence globale
            window.audioControlsModule = audioControls;
            
            // Trouver le conteneur narratif
            const narrativeContainer = document.querySelector('.narrative-container');
            if (narrativeContainer) {
                // Créer les contrôles audio dans l'onglet narratif
                audioControls.createAudioControls(narrativeContainer);
            } else {
                console.warn('[App] Conteneur narratif non trouvé pour les contrôles audio');
            }
            
            window.audioControlsModuleLoaded = true;
            console.log('[App] Module de contrôles audio chargé avec succès');
        } else {
            console.error(`[App] Fichier audioControls.js non trouvé à ${modulePath}`);
        }
    } catch (error) {
        console.error('[App] Erreur lors du chargement du module de contrôles audio:', error);
    }
}

/**
 * Fonction de débogage pour vérifier l'état des modules
 */
function debugModuleStatus() {
    console.log('=== ÉTAT DES MODULES ===');
    console.log('audioModuleLoaded:', window.audioModuleLoaded);
    console.log('bluetoothModuleLoaded:', window.bluetoothModuleLoaded);
    console.log('narrativeModuleLoaded:', window.narrativeModuleLoaded);
    console.log('audioControlsModuleLoaded:', window.audioControlsModuleLoaded);
    
    console.log('=== OBJETS GLOBAUX ===');
    console.log('window.audioSystem:', !!window.audioSystem);
    console.log('window.bluetoothModule:', !!window.bluetoothModule);
    console.log('window.narrativeSystem:', !!window.narrativeSystem);
    console.log('window.audioControlsModule:', !!window.audioControlsModule);
    
    if (window.audioSystem) {
        console.log('=== MÉTHODES AUDIO DISPONIBLES ===');
        console.log('loadAudioFile:', typeof window.audioSystem.loadAudioFile);
        console.log('togglePlayPause:', typeof window.audioSystem.togglePlayPause);
        console.log('startPlayback:', typeof window.audioSystem.startPlayback);
        console.log('stopPlayback:', typeof window.audioSystem.stopPlayback);
        console.log('setPlaybackRate:', typeof window.audioSystem.setPlaybackRate);
        console.log('setVolume:', typeof window.audioSystem.setVolume);
        console.log('isAudioBufferLoaded:', typeof window.audioSystem.isAudioBufferLoaded);
        console.log('isPlaybackActive:', typeof window.audioSystem.isPlaybackActive);
        console.log('audioEvents:', !!window.audioSystem.audioEvents);
    }
    
    console.log('=== ÉTAT DE L\'APPLICATION ===');
    console.log('appState:', window.appState);
}

// Fonction pour forcer le chargement audio
window.forceLoadAudio = () => {
    console.log('[Debug] Forçage du chargement audio...');
    loadAudioModule();
    setTimeout(() => {
        if (window.audioControlsModule && typeof window.audioControlsModule.synchronizeWithAudioSystem === 'function') {
            window.audioControlsModule.synchronizeWithAudioSystem();
        }
    }, 2000);
};

// Ajout d'un gestionnaire global pour activer l'audio
document.addEventListener('click', function() {
    safeResumeAudioContext();
});

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] Initialisation de l\'application');
    
    // Configurer le système de log
    setupLogging();
    
    // Créer le log visuel après un petit délai
    setTimeout(createVisualLog, 500);
    
    // Configurer la navigation par onglets
    setupTabNavigation();
    
    // Configurer le chargement différé des modules
    setupDeferredModuleLoading();
    
    // Supprimer immédiatement les contrôles audio de l'onglet Sound au chargement
    setTimeout(() => {
        completelySuppressSoundTabAudioControls();
    }, 1000);
    
    // Initialiser l'état de l'application
    window.appState = {
        audioReady: false,
        bluetoothReady: false,
        narrativeReady: false
    };
    
    // MODIFICATION: Charger tous les modules essentiels au démarrage
    setTimeout(() => {
        console.log('[App] Chargement des modules essentiels...');
        
        // Charger le module audio en premier
        loadAudioModule();
        
        // Charger le module narratif après
        setTimeout(() => {
            loadNarrativeModule();
        }, 1000);
        
        // Charger le module Bluetooth
        setTimeout(() => {
            loadBluetoothModule();
        }, 1500);
        
    }, 800);
    
    // Créer la fenêtre de dialogue persistante après un court délai
    setTimeout(createPersistentDialogue, 2000);
    
    // Charger les contrôles audio pour l'onglet narratif après l'initialisation
    setTimeout(() => {
        if (!window.audioControlsModuleLoaded) {
            console.log('[App] Chargement des contrôles audio...');
            loadAudioControlsModule();
        }
    }, 2500);
    
    // Gestionnaire pour les changements d'onglet
    document.addEventListener('tabChanged', (event) => {
        const { tabId } = event.detail;
        
        // Actions spécifiques par onglet
        if (tabId === 'mainTab') {
            // S'assurer que tous les modules sont chargés
            setTimeout(() => {
                if (!window.audioModuleLoaded) loadAudioModule();
                if (!window.narrativeModuleLoaded) loadNarrativeModule();
                if (!window.audioControlsModuleLoaded) loadAudioControlsModule();
            }, 500);
        }
    });
    
    // Exécuter le débogage après 3 secondes
    setTimeout(() => {
        debugModuleStatus();
        
        // Forcer le chargement du module audio si pas encore chargé
        if (!window.audioModuleLoaded) {
            console.log('[Debug] Tentative de chargement forcé du module audio');
            loadAudioModule();
        }
        
        // Recharger les contrôles audio après 2 secondes supplémentaires
        setTimeout(() => {
            debugModuleStatus();
            
            // Forcer la synchronisation des contrôles audio
            if (window.audioControlsModule && typeof window.audioControlsModule.synchronizeWithAudioSystem === 'function') {
                console.log('[Debug] Synchronisation forcée des contrôles audio');
                window.audioControlsModule.synchronizeWithAudioSystem();
            }
        }, 2000);
        
    }, 3000);
    
    console.log('[App] Application initialisée avec succès');
});