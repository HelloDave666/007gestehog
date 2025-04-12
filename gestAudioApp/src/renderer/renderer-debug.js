// Point d'entrée du processus de rendu simplifié pour débogage
console.log('[Renderer-Debug] Initialisation simplifiée du processus de rendu');

// Fonction pour afficher des messages de débogage visuels
function showDebugMessage(message) {
  const debugElement = document.createElement('div');
  debugElement.style.position = 'fixed';
  debugElement.style.bottom = '10px';
  debugElement.style.right = '10px';
  debugElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
  debugElement.style.color = 'white';
  debugElement.style.padding = '10px';
  debugElement.style.borderRadius = '5px';
  debugElement.style.zIndex = '9999';
  debugElement.textContent = message;
  document.body.appendChild(debugElement);
  
  setTimeout(() => {
    document.body.removeChild(debugElement);
  }, 5000);
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
  showDebugMessage('[App] Initialisation de l\'application');
  
  // Initialiser uniquement l'interface utilisateur
  initUI();
  
  showDebugMessage('[App] Application initialisée avec succès');
});

// Initialisation de l'interface utilisateur
function initUI() {
  showDebugMessage('[UI] Initialisation de l\'interface utilisateur');
  
  // Sélection des onglets
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  showDebugMessage(`[UI] Onglets trouvés: ${tabButtons.length}`);
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      showDebugMessage(`[UI] Onglet cliqué: ${button.getAttribute('data-tab')}`);
      
      // Désactiver tous les boutons et contenus
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Activer le bouton et le contenu correspondant
      button.classList.add('active');
      const tabId = button.getAttribute('data-tab');
      const tabContent = document.getElementById(tabId);
      
      if (tabContent) {
        tabContent.classList.add('active');
      } else {
        showDebugMessage(`[UI] ERREUR: Contenu non trouvé: ${tabId}`);
      }
    });
  });
}