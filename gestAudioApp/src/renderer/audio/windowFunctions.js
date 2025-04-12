/**
 * Fonctions de fenêtrage audio pour la synthèse granulaire
 * Ces fonctions créent différentes enveloppes pour le traitement des grains audio
 */

/**
 * Crée une fenêtre audio selon le type spécifié
 * @param {string} type - Type de fenêtre ('hann', 'hamming', 'rectangle', 'triangle')
 * @param {number} length - Longueur de la fenêtre en échantillons
 * @returns {Float32Array} - Tableau contenant les valeurs de la fenêtre
 */
function createWindow(type, length) {
  const window = new Float32Array(length);
  const factor = 2 * Math.PI / (length - 1);
  
  switch (type) {
    case 'hann':
      for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos(i * factor));
      }
      break;
    
    case 'hamming':
      for (let i = 0; i < length; i++) {
        window[i] = 0.54 - 0.46 * Math.cos(i * factor);
      }
      break;
    
    case 'rectangle':
      for (let i = 0; i < length; i++) {
        window[i] = 1.0;
      }
      break;
    
    case 'triangle':
      const midPoint = (length - 1) / 2;
      for (let i = 0; i < length; i++) {
        window[i] = 1.0 - Math.abs((i - midPoint) / midPoint);
      }
      break;
    
    default:
      // Par défaut: Hann
      for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos(i * factor));
      }
  }
  
  return window;
}

// Exporter les fonctions du module
module.exports = {
  createWindow
};