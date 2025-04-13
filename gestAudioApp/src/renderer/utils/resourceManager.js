/**
 * Gestionnaire de ressources pour l'application
 * Gère le chargement, la mise en cache et l'accès aux ressources (images, scénarios, etc.)
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Émetteur d'événements pour notifier le chargement des ressources
const resourceEvents = new EventEmitter();

// Cache pour les ressources
const cache = {
    images: new Map(),
    scenarios: new Map(),
    audio: new Map()
};

// Chemin de base pour les ressources
let basePath = '';

/**
 * Initialise le gestionnaire de ressources
 * @param {string} baseResourcePath - Chemin de base vers les ressources
 */
function init(baseResourcePath = '') {
    basePath = baseResourcePath || process.cwd();
    console.log('[Resources] Gestionnaire initialisé avec le chemin de base:', basePath);
    return true;
}

/**
 * Charge une image depuis le système de fichiers et la convertit en Data URL
 * @param {string} imagePath - Chemin relatif vers l'image
 * @returns {Promise<string>} - Data URL de l'image
 */
async function loadImage(imagePath) {
    // Vérifier si l'image est déjà en cache
    if (cache.images.has(imagePath)) {
        return cache.images.get(imagePath);
    }

    try {
        // Construire le chemin complet
        const fullPath = path.join(basePath, imagePath);
        console.log('[Resources] Chargement de l\'image:', fullPath);
        
        // Vérifier si le fichier existe
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Image non trouvée: ${fullPath}`);
        }
        
        // Lire le fichier et convertir en base64
        const imageBuffer = fs.readFileSync(fullPath);
        
        // Déterminer le type MIME basé sur l'extension
        const extension = path.extname(imagePath).toLowerCase();
        let mimeType = 'image/png'; // Par défaut
        
        if (extension === '.jpg' || extension === '.jpeg') {
            mimeType = 'image/jpeg';
        } else if (extension === '.gif') {
            mimeType = 'image/gif';
        } else if (extension === '.svg') {
            mimeType = 'image/svg+xml';
        } else if (extension === '.webp') {
            mimeType = 'image/webp';
        }
        
        // Créer le data URL
        const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        
        // Mettre en cache
        cache.images.set(imagePath, dataUrl);
        
        console.log('[Resources] Image chargée avec succès:', imagePath);
        return dataUrl;
    } catch (error) {
        console.error('[Resources] Erreur lors du chargement de l\'image:', error);
        return null;
    }
}

/**
 * Charge un scénario à partir d'un fichier JSON
 * @param {string} scenarioPath - Chemin relatif vers le fichier JSON
 * @returns {Promise<Object>} - Données du scénario
 */
async function loadScenario(scenarioPath) {
    // Vérifier si le scénario est déjà en cache
    if (cache.scenarios.has(scenarioPath)) {
        return cache.scenarios.get(scenarioPath);
    }

    try {
        // Construire le chemin complet
        const fullPath = path.join(basePath, scenarioPath);
        console.log('[Resources] Chargement du scénario:', fullPath);
        
        // Vérifier si le fichier existe
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Scénario non trouvé: ${fullPath}`);
        }
        
        // Lire et parser le fichier JSON
        const data = fs.readFileSync(fullPath, 'utf8');
        const scenario = JSON.parse(data);
        
        // Mettre en cache
        cache.scenarios.set(scenarioPath, scenario);
        
        console.log('[Resources] Scénario chargé avec succès:', scenarioPath);
        return scenario;
    } catch (error) {
        console.error('[Resources] Erreur lors du chargement du scénario:', error);
        return null;
    }
}

/**
 * Précharge plusieurs ressources en parallèle
 * @param {Object} resources - Ressources à précharger
 * @param {Array<string>} resources.images - Liste des chemins d'images
 * @param {Array<string>} resources.scenarios - Liste des chemins de scénarios
 * @returns {Promise<boolean>} - Succès du préchargement
 */
async function preloadResources(resources) {
    try {
        const promises = [];
        
        // Précharger les images
        if (resources.images && Array.isArray(resources.images)) {
            resources.images.forEach(imagePath => {
                promises.push(loadImage(imagePath));
            });
        }
        
        // Précharger les scénarios
        if (resources.scenarios && Array.isArray(resources.scenarios)) {
            resources.scenarios.forEach(scenarioPath => {
                promises.push(loadScenario(scenarioPath));
            });
        }
        
        // Attendre que tout soit chargé
        await Promise.all(promises);
        
        // Notifier que les ressources sont prêtes
        resourceEvents.emit('resourcesLoaded');
        
        console.log('[Resources] Préchargement des ressources terminé avec succès');
        return true;
    } catch (error) {
        console.error('[Resources] Erreur lors du préchargement des ressources:', error);
        resourceEvents.emit('resourcesError', error);
        return false;
    }
}

/**
 * Obtient une ressource du cache
 * @param {string} type - Type de ressource ('images', 'scenarios', 'audio')
 * @param {string} key - Clé de la ressource dans le cache
 * @returns {any} - Ressource demandée ou null si non trouvée
 */
function getResource(type, key) {
    if (!cache[type] || !cache[type].has(key)) {
        console.warn(`[Resources] Ressource non trouvée: ${type}/${key}`);
        return null;
    }
    
    return cache[type].get(key);
}

/**
 * Liste toutes les ressources en cache
 * @returns {Object} - État du cache
 */
function getResourceStatus() {
    return {
        images: Array.from(cache.images.keys()),
        scenarios: Array.from(cache.scenarios.keys()),
        audio: Array.from(cache.audio.keys())
    };
}

/**
 * Vide le cache des ressources
 * @param {string} type - Type spécifique à vider (ou tout si non spécifié)
 */
function clearCache(type = null) {
    if (type && cache[type]) {
        cache[type].clear();
        console.log(`[Resources] Cache ${type} vidé`);
    } else {
        Object.keys(cache).forEach(key => cache[key].clear());
        console.log('[Resources] Cache entièrement vidé');
    }
}

// Exporter les fonctions du module
module.exports = {
    init,
    loadImage,
    loadScenario,
    preloadResources,
    getResource,
    getResourceStatus,
    clearCache,
    resourceEvents
};