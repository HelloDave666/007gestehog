const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// Importation du module d'écran d'introduction
const { setupIntroScreen, introEvents } = require('./utils/introScreen');

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
    // Note: Ceci sera appelé après l'animation d'intro
    window.activateMainTab = function() {
        activateTab('mainTab');
    };
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
                break;
                
            case 'mainTab':
                console.log('[App] Chargement du module Narratif');
                loadNarrativeModule();
                break;
        }
    });
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
        if (window.audioModuleLoaded) return;
        
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
            
            // Ajouter un bouton de débogage simplifié
            const soundTab = document.getElementById('soundTab');
            if (soundTab) {
                const debugContainer = document.createElement('div');
                debugContainer.style.marginTop = '20px';
                debugContainer.style.padding = '10px';
                debugContainer.style.backgroundColor = 'rgba(0,0,0,0.1)';
                debugContainer.style.borderRadius = '5px';
                
                const debugTitle = document.createElement('h3');
                debugTitle.textContent = 'Débogage Audio';
                debugContainer.appendChild(debugTitle);
                
                // Boutons de test
                const testButtonsContainer = document.createElement('div');
                testButtonsContainer.style.marginTop = '10px';
                
                const testPlayButton = document.createElement('button');
                testPlayButton.textContent = 'Test Lecture';
                testPlayButton.style.marginRight = '10px';
                testPlayButton.addEventListener('click', () => {
                    if (window.audioSystem && typeof window.audioSystem.testPlayback === 'function') {
                        try {
                            console.log('[Debug] Test de lecture directe');
                            window.audioSystem.testPlayback();
                        } catch (err) {
                            console.error('[Debug] Erreur de test lecture:', err);
                        }
                    }
                });
                testButtonsContainer.appendChild(testPlayButton);
                
                const activateAudioButton = document.createElement('button');
                activateAudioButton.textContent = 'Activer Audio';
                activateAudioButton.style.backgroundColor = '#e67e22';
                activateAudioButton.style.color = 'white';
                activateAudioButton.style.border = 'none';
                activateAudioButton.style.borderRadius = '3px';
                activateAudioButton.style.padding = '5px 10px';
                activateAudioButton.style.marginLeft = '10px';
                activateAudioButton.addEventListener('click', () => {
                    // Force l'activation du contexte audio
                    safeResumeAudioContext();
                    activateAudioButton.textContent = 'Audio Activé';
                    activateAudioButton.style.backgroundColor = '#27ae60';
                });
                testButtonsContainer.appendChild(activateAudioButton);
                
                debugContainer.appendChild(testButtonsContainer);
                soundTab.appendChild(debugContainer);
            }
            
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
        if (window.narrativeModuleLoaded) return;
        
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
    
    // Initialiser l'état de l'application
    window.appState = {
        audioReady: false,
        bluetoothReady: false,
        narrativeReady: false
    };
    
    // Initialiser l'écran d'introduction
    const intro = setupIntroScreen('assets/images/rita_echo.png', 3000);
    
    // Écouter l'événement "completed" émis quand l'animation est terminée
    introEvents.on('completed', () => {
        console.log('[App] Écran d\'introduction terminé, chargement des modules');
        
        // Activer l'onglet principal
        if (typeof window.activateMainTab === 'function') {
            window.activateMainTab();
        }
        
        // Charger automatiquement le module narratif
        setTimeout(() => {
            loadNarrativeModule();
            
            // Précharger les autres modules en arrière-plan
            setTimeout(() => {
                loadAudioModule();
                loadBluetoothModule();
            }, 500);
        }, 500);
        
        // Activer le contexte audio si nécessaire
        setTimeout(safeResumeAudioContext, 1000);
    });
    
    console.log('[App] Application initialisée avec succès');
});