/**
 * Interface visuelle pour l'exercice "Cœur de givre"
 */

class HeartOfFrostInterface {
  constructor(container) {
    this.container = container;
    this.canvas = null;
    this.ctx = null;
    this.animationFrame = null;
    this.trailPoints = [];
    this.maxTrailLength = 100;
  }

  /**
   * Crée l'interface
   */
  create() {
    this.container.innerHTML = `
      <div class="frost-exercise-panel">
        <div class="frost-header">
          <h2>Cœur de givre</h2>
          <p class="frost-subtitle">Faites tourner le capteur en cercles parfaits</p>
        </div>
        
        <div class="frost-main">
          <div class="frost-visualization">
            <canvas id="frost-canvas" width="400" height="400"></canvas>
            <div class="rotation-counter">
              <span id="rotation-count">0</span> / 8
              <div class="rotation-label">rotations</div>
            </div>
          </div>
          
          <div class="frost-metrics">
            <div class="metric-item">
              <div class="metric-label">Tempo</div>
              <div class="metric-value">
                <span id="tempo-value">--</span> BPM
                <div class="metric-bar">
                  <div id="tempo-accuracy-bar" class="metric-fill"></div>
                </div>
              </div>
            </div>
            
            <div class="metric-item">
              <div class="metric-label">Circularité</div>
              <div class="metric-value">
                <span id="circularity-value">--</span>%
                <div class="metric-bar">
                  <div id="circularity-bar" class="metric-fill"></div>
                </div>
              </div>
            </div>
            
            <div class="metric-item">
              <div class="metric-label">Score global</div>
              <div class="metric-value">
                <span id="global-score">--</span>%
                <div class="metric-bar">
                  <div id="global-score-bar" class="metric-fill"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="frost-instructions">
          <h4>Instructions:</h4>
          <ul>
            <li>Tenez le capteur gauche horizontalement</li>
            <li>Faites-le tourner en cercle parfait</li>
            <li>Maintenez un rythme constant (60 BPM = 1 tour/seconde)</li>
            <li>Complétez 8 rotations pour réussir l'exercice</li>
          </ul>
        </div>
        
        <div class="frost-feedback" id="frost-feedback"></div>
        
        <div class="frost-controls">
          <button class="btn-stop" onclick="window.stopHeartOfFrost()">Arrêter</button>
          <button class="btn-reset" onclick="window.resetHeartOfFrost()">Recommencer</button>
        </div>
      </div>
    `;

    this.addStyles();
    this.initCanvas();
  }

  /**
   * Ajoute les styles CSS
   */
  addStyles() {
    if (!document.getElementById('frost-styles')) {
      const style = document.createElement('style');
      style.id = 'frost-styles';
      style.textContent = `
        .frost-exercise-panel {
          background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
          border-radius: 15px;
          padding: 30px;
          margin: 20px 0;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }
        
        .frost-header {
          text-align: center;
          margin-bottom: 30px;
        }
        
        .frost-header h2 {
          color: #1976d2;
          margin-bottom: 10px;
          font-size: 32px;
        }
        
        .frost-subtitle {
          color: #546e7a;
          font-size: 18px;
        }
        
        .frost-main {
          display: flex;
          gap: 30px;
          margin-bottom: 30px;
        }
        
        .frost-visualization {
          position: relative;
          flex: 1;
        }
        
        #frost-canvas {
          background: white;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          display: block;
          margin: 0 auto;
        }
        
        .rotation-counter {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          font-size: 48px;
          font-weight: bold;
          color: #1976d2;
          pointer-events: none;
        }
        
        .rotation-label {
          font-size: 16px;
          font-weight: normal;
          color: #546e7a;
        }
        
        .frost-metrics {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .metric-item {
          background: white;
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .metric-label {
          font-size: 14px;
          color: #546e7a;
          margin-bottom: 10px;
        }
        
        .metric-value {
          font-size: 24px;
          font-weight: bold;
          color: #1976d2;
        }
        
        .metric-bar {
          width: 100%;
          height: 10px;
          background: #e0e0e0;
          border-radius: 5px;
          margin-top: 10px;
          overflow: hidden;
        }
        
        .metric-fill {
          height: 100%;
          background: linear-gradient(90deg, #42a5f5, #1976d2);
          transition: width 0.3s ease;
          border-radius: 5px;
        }
        
        .frost-instructions {
          background: rgba(255,255,255,0.8);
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
        }
        
        .frost-instructions h4 {
          color: #1976d2;
          margin-bottom: 10px;
        }
        
        .frost-instructions ul {
          margin: 0;
          padding-left: 20px;
          color: #546e7a;
        }
        
        .frost-instructions li {
          margin-bottom: 5px;
        }
        
        .frost-feedback {
          text-align: center;
          font-size: 20px;
          font-weight: bold;
          min-height: 40px;
          margin-bottom: 20px;
        }
        
        .frost-controls {
          display: flex;
          gap: 15px;
          justify-content: center;
        }
        
        .frost-controls button {
          padding: 12px 30px;
          border: none;
          border-radius: 25px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        .btn-stop {
          background: #f44336;
          color: white;
        }
        
        .btn-stop:hover {
          background: #d32f2f;
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        
        .btn-reset {
          background: #ff9800;
          color: white;
        }
        
        .btn-reset:hover {
          background: #f57c00;
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        
        .feedback-success {
          color: #4caf50;
        }
        
        .feedback-perfect {
          color: #1976d2;
          animation: pulse 0.5s ease-in-out;
        }
        
        .btn-load-audio {
          background: #3498db;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          margin: 10px auto;
          display: block;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
        }
        
        .btn-load-audio:hover {
          background: #2980b9;
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Initialise le canvas
   */
  initCanvas() {
    this.canvas = document.getElementById('frost-canvas');
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d');
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
  }

  /**
   * Met à jour l'affichage
   */
  update(data) {
    // Mettre à jour les compteurs
    document.getElementById('rotation-count').textContent = data.rotationCount;
    
    // Mettre à jour les métriques
    const tempo = Math.round(data.metrics.tempo);
    const tempoAccuracy = Math.round(data.metrics.tempoAccuracy * 100);
    const circularity = Math.round(data.metrics.circularity * 100);
    const globalScore = Math.round((data.metrics.tempoAccuracy + data.metrics.circularity) / 2 * 100);
    
    document.getElementById('tempo-value').textContent = tempo || '--';
    document.getElementById('tempo-accuracy-bar').style.width = `${tempoAccuracy}%`;
    
    document.getElementById('circularity-value').textContent = circularity || '--';
    document.getElementById('circularity-bar').style.width = `${circularity}%`;
    
    document.getElementById('global-score').textContent = globalScore || '--';
    document.getElementById('global-score-bar').style.width = `${globalScore}%`;
    
    // Ajouter le point au trail
    if (data.position) {
      this.trailPoints.push({
        x: data.position.x,
        y: data.position.y,
        timestamp: Date.now()
      });
      
      // Limiter la longueur du trail
      if (this.trailPoints.length > this.maxTrailLength) {
        this.trailPoints.shift();
      }
    }
    
    // Dessiner la visualisation
    this.draw(data);
  }

  /**
   * Dessine la visualisation
   */
  draw(data) {
    if (!this.ctx) return;
    
    // Effacer le canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Dessiner la grille de référence
    this.drawGrid();
    
    // Dessiner le cercle cible
    this.drawTargetCircle();
    
    // Dessiner le trail
    this.drawTrail();
    
    // Dessiner la position actuelle
    if (data.position) {
      this.drawCurrentPosition(data.position);
    }
    
    // Dessiner l'indicateur de progression
    this.drawProgressIndicator(data.progress || 0);
  }

  /**
   * Dessine la grille de fond
   */
  drawGrid() {
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 1;
    
    // Lignes verticales et horizontales
    for (let x = 0; x < this.canvas.width; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    
    for (let y = 0; y < this.canvas.height; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
    
    // Axes centraux
    this.ctx.strokeStyle = '#bdbdbd';
    this.ctx.lineWidth = 2;
    
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX, 0);
    this.ctx.lineTo(this.centerX, this.canvas.height);
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.centerY);
    this.ctx.lineTo(this.canvas.width, this.centerY);
    this.ctx.stroke();
  }

  /**
   * Dessine le cercle cible
   */
  drawTargetCircle() {
    const radius = 150;
    
    // Cercle principal
    this.ctx.strokeStyle = '#1976d2';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 5]);
    
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius, 0, 2 * Math.PI);
    this.ctx.stroke();
    
    this.ctx.setLineDash([]);
    
    // Zones de tolérance
    this.ctx.strokeStyle = '#bbdefb';
    this.ctx.lineWidth = 1;
    
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius - 20, 0, 2 * Math.PI);
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius + 20, 0, 2 * Math.PI);
    this.ctx.stroke();
  }

  /**
   * Dessine le trail du mouvement
   */
  drawTrail() {
    if (this.trailPoints.length < 2) return;
    
    const scale = 2; // Facteur d'échelle pour la visualisation
    
    this.ctx.strokeStyle = '#42a5f5';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    
    for (let i = 1; i < this.trailPoints.length; i++) {
      const opacity = i / this.trailPoints.length;
      this.ctx.globalAlpha = opacity * 0.8;
      
      this.ctx.beginPath();
      this.ctx.moveTo(
        this.centerX + this.trailPoints[i-1].x * scale,
        this.centerY + this.trailPoints[i-1].y * scale
      );
      this.ctx.lineTo(
        this.centerX + this.trailPoints[i].x * scale,
        this.centerY + this.trailPoints[i].y * scale
      );
      this.ctx.stroke();
    }
    
    this.ctx.globalAlpha = 1;
  }

  /**
   * Dessine la position actuelle
   */
  drawCurrentPosition(position) {
    const scale = 2;
    const x = this.centerX + position.x * scale;
    const y = this.centerY + position.y * scale;
    
    // Cercle externe
    this.ctx.fillStyle = '#1976d2';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 12, 0, 2 * Math.PI);
    this.ctx.fill();
    
    // Cercle interne
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 6, 0, 2 * Math.PI);
    this.ctx.fill();
  }

  /**
   * Dessine l'indicateur de progression de rotation
   */
  drawProgressIndicator(progress) {
    const radius = 180;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (progress * 2 * Math.PI);
    
    this.ctx.strokeStyle = '#4caf50';
    this.ctx.lineWidth = 5;
    
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius, startAngle, endAngle);
    this.ctx.stroke();
  }

  /**
   * Affiche un feedback
   */
  showFeedback(message, type = 'info') {
    const feedbackEl = document.getElementById('frost-feedback');
    if (feedbackEl) {
      feedbackEl.className = 'frost-feedback';
      if (type === 'success') {
        feedbackEl.classList.add('feedback-success');
      } else if (type === 'perfect') {
        feedbackEl.classList.add('feedback-perfect');
      }
      feedbackEl.textContent = message;
    }
  }

  /**
   * Animation de rotation complète
   */
  onRotationComplete() {
    this.showFeedback('Rotation complète !', 'perfect');
    
    // Flash visuel
    if (this.ctx) {
      this.ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    setTimeout(() => {
      this.showFeedback('', 'info');
    }, 1000);
  }

  /**
   * Nettoie l'interface
   */
  cleanup() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.trailPoints = [];
  }
}

module.exports = HeartOfFrostInterface;