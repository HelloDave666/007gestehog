// introScreen.js - Gestion de l'écran d'introduction
const { EventEmitter } = require('events');

// Créer un émetteur d'événements pour l'écran d'intro
const introEvents = new EventEmitter();

/**
 * Initialise l'écran d'introduction avec l'image
 * @param {string} imagePath - Chemin vers le fichier image
 * @param {number} duration - Durée en ms avant la fermeture automatique
 */
function setupIntroScreen(imagePath = 'assets/images/rita_echo.png', duration = 4000) {
    // Vérifier si l'écran d'intro existe déjà dans le DOM
    let introScreen = document.getElementById('intro-screen');
    if (!introScreen) {
        console.error('[Intro] Écran d\'introduction non trouvé dans le DOM');
        return introEvents;
    }

    console.log('[Intro] Initialisation de l\'écran d\'introduction');
    
    // Référencer les éléments
    const skipButton = document.querySelector('.skip-intro');
    const introLogo = document.querySelector('.intro-logo');
    
    // Mettre à jour le chemin de l'image si fourni
    if (introLogo && imagePath) {
        introLogo.src = imagePath;
        console.log(`[Intro] Image chargée: ${imagePath}`);
        
        // Ajouter un gestionnaire d'erreur pour l'image
        introLogo.onerror = () => {
            console.error(`[Intro] Erreur de chargement de l'image: ${imagePath}`);
            // Utiliser une image de secours ou continuer sans image
            introLogo.style.display = 'none';
        };
    }
    
    // Configurer le timer pour masquer automatiquement
    const introTimer = setTimeout(() => {
        console.log('[Intro] Délai d\'introduction écoulé, fermeture automatique');
        hideIntroScreen();
    }, duration);
    
    // Configurer le bouton pour passer l'intro
    if (skipButton) {
        skipButton.addEventListener('click', () => {
            console.log('[Intro] Bouton "Passer" cliqué');
            clearTimeout(introTimer);
            hideIntroScreen();
        });
    }
    
    // Fonction pour masquer l'écran d'intro
    function hideIntroScreen() {
        if (introScreen) {
            console.log('[Intro] Masquage de l\'écran d\'introduction...');
            introScreen.classList.add('hidden');
            
            // Nettoyage après la transition
            setTimeout(() => {
                console.log('[Intro] Transition terminée, émission de l\'événement "completed"');
                try {
                    // Force l'activation du premier onglet explicitement
                    const mainTab = document.querySelector('[data-tab="mainTab"]');
                    if (mainTab) {
                        console.log('[Intro] Activation forcée de l\'onglet principal');
                        mainTab.click();
                    } else {
                        console.error('[Intro] Onglet principal non trouvé');
                    }
                    
                    // Force un repaint du DOM
                    document.body.style.display = 'none';
                    setTimeout(() => {
                        document.body.style.display = '';
                        console.log('[Intro] Repaint du DOM effectué');
                    }, 50);
                    
                    // Émettre l'événement de fin
                    introEvents.emit('completed');
                } catch (error) {
                    console.error('[Intro] Erreur lors de la fin de l\'intro:', error);
                }
            }, 800); // Correspond à la durée de transition CSS
        }
    }
    
    // Ajouter un bouton de secours pour le débogage
    const emergencyButton = document.createElement('button');
    emergencyButton.textContent = 'Débloquer (Urgence)';
    emergencyButton.style.position = 'fixed';
    emergencyButton.style.bottom = '10px';
    emergencyButton.style.left = '10px';
    emergencyButton.style.zIndex = '10000';
    emergencyButton.style.backgroundColor = '#e74c3c';
    emergencyButton.style.color = 'white';
    emergencyButton.style.border = 'none';
    emergencyButton.style.padding = '10px';
    emergencyButton.style.borderRadius = '5px';
    emergencyButton.style.cursor = 'pointer';
    emergencyButton.addEventListener('click', () => {
        console.log('[Intro] Bouton d\'urgence activé');
        
        // Forcer la suppression de l'écran d'intro
        if (introScreen && introScreen.parentNode) {
            introScreen.style.display = 'none';
            console.log('[Intro] Écran d\'intro forcé en display:none');
        }
        
        // Forcer l'activation de l'onglet principal
        const mainTab = document.querySelector('[data-tab="mainTab"]');
        if (mainTab) mainTab.click();
        
        // Forcer l'activation audio
        if (window.safeResumeAudioContext) {
            window.safeResumeAudioContext();
        }
        
        // Émettre l'événement de fin
        introEvents.emit('completed');
    });
    document.body.appendChild(emergencyButton);
    
    return introEvents;
}

module.exports = {
    setupIntroScreen,
    introEvents
};