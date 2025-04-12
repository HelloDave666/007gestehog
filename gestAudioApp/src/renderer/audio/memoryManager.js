/**
 * Gestionnaire de mémoire pour le système audio
 * Responsable de l'optimisation et du nettoyage des ressources audio
 */

// Liste des nœuds audio actifs à surveiller
let activeNodes = [];

/**
 * Ajoute un nœud audio à la liste des nœuds à surveiller
 * @param {AudioNode} node - Nœud audio à surveiller
 */
function trackNode(node) {
  activeNodes.push({
    node: node,
    endTime: node.context.currentTime + (node.buffer?.duration || 0),
    tracked: Date.now()
  });
}

/**
 * Nettoie les ressources audio qui ne sont plus utilisées
 * @returns {number} - Nombre de nœuds nettoyés
 */
function cleanupAudioResources() {
  const currentTime = Date.now();
  const initialNodeCount = activeNodes.length;
  
  // Filtrer les nœuds encore actifs
  activeNodes = activeNodes.filter(item => {
    const audioContext = item.node.context;
    const isExpired = audioContext.currentTime > item.endTime + 0.5;
    const isTooOld = currentTime - item.tracked > 60000; // 1 minute
    
    if (isExpired || isTooOld) {
      try {
        // Nettoyer le nœud si possible
        if (typeof item.node.disconnect === 'function') {
          item.node.disconnect();
        }
        if (item.node.buffer) {
          item.node.buffer = null;
        }
        return false; // Retirer de la liste
      } catch (error) {
        console.error('[Mémoire] Erreur lors du nettoyage d\'un nœud audio:', error);
        return false; // Retirer quand même pour éviter les fuites
      }
    }
    
    return true; // Conserver dans la liste
  });
  
  return initialNodeCount - activeNodes.length;
}

/**
 * Effectue une optimisation complète de la mémoire
 * @returns {boolean} - Succès de l'opération
 */
function optimizeMemoryUsage() {
  try {
    // Nettoyer les nœuds audio
    const cleanedNodes = cleanupAudioResources();
    
    // Forcer la collecte des déchets si disponible
    if (global.gc) {
      global.gc();
    }
    
    console.log(`[Mémoire] Optimisation effectuée: ${cleanedNodes} nœuds nettoyés`);
    return true;
  } catch (error) {
    console.error('[Mémoire] Erreur lors de l\'optimisation de la mémoire:', error);
    return false;
  }
}

// Exporter les fonctions du module
module.exports = {
  trackNode,
  cleanupAudioResources,
  optimizeMemoryUsage
};