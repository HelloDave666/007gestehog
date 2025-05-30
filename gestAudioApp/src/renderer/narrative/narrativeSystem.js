/**
 * Système narratif ludopédagogique
 * Inspiré des dialogues du jeu Celeste
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// Émetteur d'événements pour la communication avec d'autres modules
const narrativeEvents = new EventEmitter();

// État du système de dialogue
const dialogueSystem = {
    queue: [],              // File d'attente des dialogues
    isActive: false,        // Si un dialogue est en cours
    textSpeed: 40,          // Vitesse d'apparition des caractères (ms)
    currentCharIndex: 0,    // Index du caractère actuel
    currentDialogue: null,  // Dialogue en cours
    container: null,        // Référence au conteneur de dialogue
    characterImage: null,   // Référence à l'image du personnage
    speakerElement: null,   // Élément affichant le nom du personnage
    contentElement: null,   // Élément affichant le texte
    continueIndicator: null,// Indicateur pour continuer
    textAnimInterval: null, // Intervalle pour l'animation du texte
    
    // Configurer le système (appelé une fois au démarrage)
    setup(container) {
        if (!container) {
            console.error('[Narrative] Conteneur de dialogue non fourni');
            return false;
        }
        
        this.container = container;
        this.createDialogueInterface();
        console.log('[Narrative] Système de dialogue initialisé');
        return true;
    },
    
    // Créer l'interface de dialogue
    createDialogueInterface() {
        // Vider le conteneur si nécessaire
        this.container.innerHTML = '';
        this.container.className = 'dialogue-container';
        
        // Créer le cadre de dialogue style Celeste
        const dialogueFrame = document.createElement('div');
        dialogueFrame.className = 'dialogue-frame';
        
        // Zone d'image du personnage
        const characterContainer = document.createElement('div');
        characterContainer.className = 'character-portrait';
        
        this.characterImage = document.createElement('img');
        // Essayer de charger l'image depuis son emplacement connu
        this.characterImage.src = './assets/images/Rita_guide.png';
        this.characterImage.alt = 'Personnage';
        this.characterImage.onerror = () => {
            console.warn('[Narrative] Image non trouvée, tentative avec chemin alternatif');
            // Essayer d'autres chemins possibles
            this.characterImage.src = '../assets/images/Rita_guide.png';
            
            this.characterImage.onerror = () => {
                console.warn('[Narrative] Seconde tentative échouée, dernier essai');
                this.characterImage.src = path.join(process.cwd(), 'assets', 'images', 'Rita_guide.png');
                
                this.characterImage.onerror = () => {
                    console.error('[Narrative] Impossible de charger l\'image');
                    characterContainer.style.backgroundColor = '#3498db';
                    characterContainer.style.display = 'flex';
                    characterContainer.style.justifyContent = 'center';
                    characterContainer.style.alignItems = 'center';
                    
                    // Créer un placeholder texte
                    const placeholderText = document.createElement('span');
                    placeholderText.textContent = 'GUIDE';
                    placeholderText.style.color = 'white';
                    placeholderText.style.fontWeight = 'bold';
                    characterContainer.appendChild(placeholderText);
                };
            };
        };
        
        characterContainer.appendChild(this.characterImage);
        dialogueFrame.appendChild(characterContainer);
        
        // Zone de texte
        const textContainer = document.createElement('div');
        textContainer.className = 'dialogue-text-container';
        
        // Nom du personnage
        this.speakerElement = document.createElement('div');
        this.speakerElement.className = 'dialogue-speaker';
        textContainer.appendChild(this.speakerElement);
        
        // Contenu du dialogue
        this.contentElement = document.createElement('div');
        this.contentElement.className = 'dialogue-content';
        textContainer.appendChild(this.contentElement);
        
        // Indicateur pour continuer
        this.continueIndicator = document.createElement('div');
        this.continueIndicator.className = 'continue-indicator';
        this.continueIndicator.innerHTML = '▼';
        this.continueIndicator.style.display = 'none';
        textContainer.appendChild(this.continueIndicator);
        
        dialogueFrame.appendChild(textContainer);
        this.container.appendChild(dialogueFrame);
        
        // Ajouter l'écouteur d'événements pour les clics
        this.container.addEventListener('click', () => {
            if (this.isActive) {
                this.speedUpText();
            }
        });
        
        // Cacher le conteneur par défaut
        this.container.style.display = 'none';
    },
    
    // Ajouter un dialogue à la file
    addDialogue(speaker, text, expression = 'neutral', callback = null) {
        this.queue.push({ speaker, text, expression, callback });
        
        // Afficher le conteneur de dialogue
        this.container.style.display = 'flex';
        
        // Si aucun dialogue n'est actif, démarrer la séquence
        if (!this.isActive) {
            this.nextDialogue();
        }
        
        // Émettre un événement
        narrativeEvents.emit('dialogueAdded', { speaker, text });
    },
    
    // Passer au dialogue suivant
    nextDialogue() {
        if (this.queue.length === 0) {
            this.isActive = false;
            this.container.style.display = 'none';
            narrativeEvents.emit('dialogueEnded');
            return;
        }
        
        this.isActive = true;
        this.currentDialogue = this.queue.shift();
        this.currentCharIndex = 0;
        
        // Mettre à jour l'expression du personnage
        if (this.characterImage) {
            // Toujours utiliser l'image Rita_guide pour l'instant
            this.characterImage.src = './assets/images/Rita_guide.png';
            
            // Remarque : Si vous souhaitez plus tard avoir différentes expressions,
            // vous pourriez utiliser un code comme celui-ci:
            /*
            const expressionPath = `./assets/images/${this.currentDialogue.speaker.toLowerCase()}_${this.currentDialogue.expression}.png`;
            if (fs.existsSync(path.join(process.cwd(), 'assets', 'images', `${this.currentDialogue.speaker.toLowerCase()}_${this.currentDialogue.expression}.png`))) {
                this.characterImage.src = expressionPath;
            } else {
                this.characterImage.src = './assets/images/Rita_guide.png';
            }
            */
        }
        
        // Mettre à jour le nom du personnage
        this.speakerElement.textContent = this.currentDialogue.speaker;
        
        // Vider le contenu du texte
        this.contentElement.textContent = '';
        
        // Masquer l'indicateur de continuation
        this.continueIndicator.style.display = 'none';
        
        // Démarrer l'animation du texte
        this.animateText();
        
        // Émettre un événement
        narrativeEvents.emit('dialogueStarted', this.currentDialogue);
    },
    
    // Animer l'apparition du texte
    animateText() {
        // Nettoyer l'intervalle précédent si existant
        if (this.textAnimInterval) {
            clearInterval(this.textAnimInterval);
        }
        
        // Démarrer la nouvelle animation
        this.textAnimInterval = setInterval(() => {
            if (this.currentCharIndex < this.currentDialogue.text.length) {
                this.contentElement.textContent = this.currentDialogue.text.substring(0, this.currentCharIndex + 1);
                this.currentCharIndex++;
            } else {
                // Animation terminée
                clearInterval(this.textAnimInterval);
                this.textAnimInterval = null;
                
                // Montrer l'indicateur de continuation
                this.continueIndicator.style.display = 'block';
                
                // Faire clignoter l'indicateur
                let visible = true;
                setInterval(() => {
                    this.continueIndicator.style.opacity = visible ? '1' : '0.3';
                    visible = !visible;
                }, 500);
                
                // Émettre un événement
                narrativeEvents.emit('textAnimationCompleted');
            }
        }, this.textSpeed);
    },
    
    // Accélérer ou compléter immédiatement le texte actuel
    speedUpText() {
        if (this.currentCharIndex < this.currentDialogue.text.length) {
            // Compléter immédiatement le texte
            clearInterval(this.textAnimInterval);
            this.textAnimInterval = null;
            this.contentElement.textContent = this.currentDialogue.text;
            this.currentCharIndex = this.currentDialogue.text.length;
            this.continueIndicator.style.display = 'block';
        } else {
            // Passer au dialogue suivant
            if (this.currentDialogue.callback) {
                this.currentDialogue.callback();
            }
            this.nextDialogue();
        }
    },
    
    // Vider la file de dialogue
    clearDialogues() {
        this.queue = [];
        if (this.textAnimInterval) {
            clearInterval(this.textAnimInterval);
        }
        this.isActive = false;
        this.container.style.display = 'none';
        narrativeEvents.emit('dialoguesCleared');
    }
};

/**
 * Système de leçons et d'exercices audio
 */
const lessonSystem = {
    lessons: [],
    currentLesson: null,
    currentStep: 0,
    
    // Charger les leçons depuis un fichier JSON
    loadLessons(filePath) {
        try {
            console.log(`[Narrative] Tentative de chargement des leçons depuis: ${filePath}`);
            
            // Vérifier si le fichier existe
            if (!fs.existsSync(filePath)) {
                console.warn(`[Narrative] Le fichier ${filePath} n'existe pas`);
                this.loadFromScenarios();
                return false;
            }
            
            const lessonsData = fs.readFileSync(filePath, 'utf8');
            let parsedData;
            
            try {
                parsedData = JSON.parse(lessonsData);
            } catch (parseError) {
                console.error('[Narrative] Erreur de parsing JSON:', parseError);
                this.loadFromScenarios();
                return false;
            }
            
            // S'assurer que this.lessons est bien un tableau
            if (Array.isArray(parsedData)) {
                this.lessons = parsedData;
            } else if (parsedData && typeof parsedData === 'object') {
                // Si c'est un objet, essayer de trouver une propriété qui pourrait être notre tableau de leçons
                if (parsedData.lessons && Array.isArray(parsedData.lessons)) {
                    this.lessons = parsedData.lessons;
                } else {
                    // Convertir l'objet en tableau si possible
                    console.warn('[Narrative] Format inattendu, tentative de conversion en tableau');
                    this.lessons = Object.values(parsedData).filter(item => typeof item === 'object');
                }
            } else {
                console.error('[Narrative] Format de données invalide pour les leçons');
                this.lessons = [];
                this.loadFromScenarios();
                return false;
            }
            
            // S'assurer que this.lessons est bien un tableau valide
            if (!Array.isArray(this.lessons)) {
                console.error('[Narrative] Échec de conversion en tableau');
                this.lessons = [];
                this.loadFromScenarios();
                return false;
            }
            
            console.log(`[Narrative] ${this.lessons.length} leçons chargées`);
            
            // Ajouter manuellement les leçons si elles n'existent pas déjà
            this.addHeartOfFrostLesson();
            this.addBluetoothConnectionLesson();
            
            narrativeEvents.emit('lessonsLoaded', this.lessons);
            return true;
        } catch (error) {
            console.error('[Narrative] Erreur lors du chargement des leçons:', error);
            
            // S'assurer que lessons est initialisé comme un tableau vide
            this.lessons = [];
            
            // Réutiliser les scenarios existants si possible
            this.loadFromScenarios();
            return false;
        }
    },
    
    // Charger les leçons à partir des scenarios existants
    loadFromScenarios() {
        try {
            const scenariosPath = path.join(process.cwd(), 'assets', 'scenarios');
            
            // Vérifier si le fichier intro.json existe
            const introPath = path.join(scenariosPath, 'intro.json');
            if (fs.existsSync(introPath)) {
                const introData = fs.readFileSync(introPath, 'utf8');
                const introScenario = JSON.parse(introData);
                
                // Adapter le format scenario au format leçon
                this.lessons = [this.convertScenarioToLesson(introScenario)];
                console.log(`[Narrative] Scenario converti en leçon: ${this.lessons[0].title}`);
                
                // Ajouter manuellement les leçons
                this.addHeartOfFrostLesson();
                this.addBluetoothConnectionLesson();
                
                narrativeEvents.emit('lessonsLoaded', this.lessons);
                return;
            }
            
            // Si intro.json n'existe pas, créer des leçons par défaut
            this.createDefaultLessons();
        } catch (error) {
            console.error('[Narrative] Erreur lors de la conversion des scenarios:', error);
            this.createDefaultLessons();
        }
    },
    
    // Ajouter la leçon Cœur de givre
    addHeartOfFrostLesson() {
        // S'assurer que lessons est un tableau
        if (!Array.isArray(this.lessons)) {
            console.error('[Narrative] this.lessons n\'est pas un tableau lors de l\'ajout de Cœur de givre');
            this.lessons = [];
        }
        
        // Vérifier si la leçon existe déjà
        const exists = this.lessons.some(lesson => lesson && lesson.id === 'heart-of-frost');
        
        if (!exists) {
            console.log('[Narrative] Ajout de la leçon Cœur de givre');
            this.lessons.push({
                id: 'heart-of-frost',
                title: 'Leçon : Cœur de givre',
                description: 'Maîtrisez l\'art de la rotation parfaite',
                steps: [
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'Bonjour ! Aujourd\'hui, nous allons apprendre un mouvement essentiel : la rotation parfaite.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'Imaginez que vous tenez une baguette de verre que vous devez chauffer uniformément dans une flamme.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'Le mouvement doit être circulaire, régulier et constant. C\'est ce qu\'on appelle le \'Cœur de givre\'.',
                        expression: 'happy'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'Prenez le capteur gauche dans votre main dominante et tenez-le horizontalement.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'Vous devrez effectuer 8 rotations complètes à un rythme de 60 battements par minute.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'L\'audio vous guidera : plus votre mouvement est précis, plus le son sera harmonieux !',
                        expression: 'excited'
                    },
                    {
                        type: 'exercise',
                        exerciseId: 'heartOfFrost',
                        audioFile: 'exercises/heartbeat.mp3'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'Magnifique ! Vous avez maîtrisé la rotation parfaite.',
                        expression: 'excited'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Rita',
                        text: 'Ce mouvement est fondamental pour de nombreuses techniques avancées. Vous êtes maintenant prêt pour des défis plus complexes !',
                        expression: 'happy'
                    }
                ]
            });
        }
    },
    
    // Ajouter la leçon de connexion des capteurs Bluetooth
    addBluetoothConnectionLesson() {
        // S'assurer que lessons est un tableau
        if (!Array.isArray(this.lessons)) {
            console.error('[Narrative] this.lessons n\'est pas un tableau lors de l\'ajout de la leçon Bluetooth');
            this.lessons = [];
        }
        
        // Vérifier si la leçon existe déjà
        const exists = this.lessons.some(lesson => lesson && lesson.id === 'bluetooth-connection');
        
        if (!exists) {
            console.log('[Narrative] Ajout de la leçon de connexion Bluetooth');
            this.lessons.push({
                id: 'bluetooth-connection',
                title: 'Connexion des capteurs',
                description: 'Apprenez à connecter et utiliser les capteurs Bluetooth',
                steps: [
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Bienvenue ! Nous allons apprendre à connecter vos capteurs Bluetooth.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Assurez-vous que les capteurs sont allumés et que le Bluetooth de votre ordinateur est activé.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Cliquez maintenant sur le bouton "Rechercher des capteurs" dans l\'onglet "Blue Tools".',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Vous devriez voir apparaître vos capteurs dans la liste. Cliquez sur chacun d\'eux pour les connecter.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Une fois connectés, les capteurs s\'illumineront et les indicateurs passeront au vert.',
                        expression: 'happy'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Prenez le capteur gauche dans votre main gauche et le capteur droit dans votre main droite.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Essayez de les incliner doucement pour voir les valeurs changer dans l\'interface.',
                        expression: 'excited'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Parfait ! Vous êtes maintenant prêt à utiliser les capteurs pour les exercices !',
                        expression: 'happy'
                    }
                ]
            });
        }
    },
    
    // Convertir un scenario au format leçon
    convertScenarioToLesson(scenario) {
        // Créer une structure de leçon à partir du scenario
        const lesson = {
            id: scenario.id || 'default',
            title: scenario.title || 'Leçon par défaut',
            steps: []
        };
        
        // Convertir les étapes du scenario
        if (scenario.steps && Array.isArray(scenario.steps)) {
            scenario.steps.forEach(step => {
                if (step.type === 'dialogue' || step.type === 'text') {
                    lesson.steps.push({
                        type: 'dialogue',
                        speaker: step.speaker || 'Guide',
                        text: step.content || step.text || '',
                        expression: 'neutral'
                    });
                } else if (step.type === 'exercise' || step.type === 'action') {
                    lesson.steps.push({
                        type: 'exercise',
                        audioFile: step.audioFile || 'sample.mp3',
                        instructions: step.instructions || step.content || ''
                    });
                }
            });
        }
        
        return lesson;
    },
    
    // Créer des leçons par défaut
    createDefaultLessons() {
        this.lessons = [
            {
                id: 'intro',
                title: 'Introduction au contrôle audio',
                steps: [
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Bienvenue dans Heart of Glass ! Je suis votre guide.',
                        expression: 'neutral'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Prenez les capteurs dans vos mains. Nous allons apprendre à contrôler le son.',
                        expression: 'happy'
                    },
                    {
                        type: 'exercise',
                        audioFile: 'sample.mp3',
                        instructions: 'Inclinez le capteur gauche vers l\'avant pour accélérer la lecture.'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Parfait ! Maintenant, inclinez-le vers l\'arrière pour lire en sens inverse.',
                        expression: 'happy'
                    }
                ]
            },
            {
                id: 'advanced',
                title: 'Techniques avancées',
                steps: [
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Passons à des techniques plus avancées !',
                        expression: 'excited'
                    },
                    {
                        type: 'dialogue',
                        speaker: 'Guide',
                        text: 'Le capteur droit contrôle le volume. Essayez de l\'incliner pour modifier le volume.',
                        expression: 'neutral'
                    },
                    {
                        type: 'exercise',
                        audioFile: 'sample2.mp3',
                        instructions: 'Utilisez les deux capteurs simultanément pour contrôler la vitesse et le volume.'
                    }
                ]
            }
        ];
        
        // Ajouter les leçons spéciales
        this.addHeartOfFrostLesson();
        this.addBluetoothConnectionLesson();
        
        console.log('[Narrative] Leçons par défaut créées');
        narrativeEvents.emit('lessonsLoaded', this.lessons);
    },
    
    // Démarrer une leçon spécifique
    startLesson(lessonId) {
        // S'assurer que lessons est un tableau
        if (!Array.isArray(this.lessons)) {
            console.error('[Narrative] this.lessons n\'est pas un tableau lors du démarrage de la leçon');
            this.lessons = [];
            this.createDefaultLessons();
        }
        
        const lesson = this.lessons.find(l => l && l.id === lessonId);
        if (!lesson) {
            console.error(`[Narrative] Leçon non trouvée: ${lessonId}`);
            return false;
        }
        
        console.log(`[Narrative] Démarrage de la leçon: ${lesson.title}`);
        this.currentLesson = lesson;
        this.currentStep = 0;
        this.processCurrentStep();
        
        narrativeEvents.emit('lessonStarted', lesson);
        return true;
    },
    
    // Traiter l'étape actuelle
    processCurrentStep() {
        if (!this.currentLesson || this.currentStep >= this.currentLesson.steps.length) {
            console.log('[Narrative] Fin de la leçon');
            narrativeEvents.emit('lessonCompleted', this.currentLesson);
            return false;
        }
        
        const step = this.currentLesson.steps[this.currentStep];
        console.log(`[Narrative] Étape ${this.currentStep + 1}/${this.currentLesson.steps.length}: ${step.type}`);
        
        if (step.type === 'dialogue') {
            // Ajouter le dialogue à la file
            dialogueSystem.addDialogue(
                step.speaker,
                step.text,
                step.expression,
                () => {
                    // Passer à l'étape suivante après le dialogue
                    setTimeout(() => {
                        this.nextStep();
                    }, 500);
                }
            );
        } else if (step.type === 'exercise') {
            // Vérifier si c'est l'exercice "Cœur de givre"
            if (step.exerciseId === 'heartOfFrost') {
                startHeartOfFrostExercise();
            } else {
                // Créer une interface pour l'exercice standard
                this.showExerciseInterface(step);
                
                // Émettre un événement pour notifier le système audio
                narrativeEvents.emit('exerciseStarted', step);
            }
        }
        
        return true;
    },
    
    // Afficher l'interface d'exercice
    showExerciseInterface(exercise) {
        if (!dialogueSystem.container) return;
        
        // Créer ou réutiliser le conteneur d'exercice
        let exerciseContainer = document.getElementById('exercise-container');
        if (!exerciseContainer) {
            exerciseContainer = document.createElement('div');
            exerciseContainer.id = 'exercise-container';
            exerciseContainer.className = 'exercise-container';
            dialogueSystem.container.parentNode.appendChild(exerciseContainer);
        }
        
        // Afficher les instructions
        exerciseContainer.innerHTML = `
            <div class="exercise-instructions">
                <h3>Exercice</h3>
                <p>${exercise.instructions}</p>
                <button id="exercise-complete-btn">J'ai terminé</button>
            </div>
        `;
        
        // Gérer le bouton de complétion
        const completeBtn = document.getElementById('exercise-complete-btn');
        if (completeBtn) {
            completeBtn.addEventListener('click', () => {
                exerciseContainer.style.display = 'none';
                this.nextStep();
            });
        }
        
        // Afficher le conteneur d'exercice
        exerciseContainer.style.display = 'block';
    },
    
    // Passer à l'étape suivante
    nextStep() {
        if (!this.currentLesson) return false;
        
        this.currentStep++;
        
        if (this.currentStep >= this.currentLesson.steps.length) {
            console.log('[Narrative] Fin de la leçon');
            narrativeEvents.emit('lessonCompleted', this.currentLesson);
            return false;
        }
        
        this.processCurrentStep();
        return true;
    }
};

/**
 * Lance l'exercice "Cœur de givre" avec connexion audio améliorée
 */
async function startHeartOfFrostExercise() {
  try {
    console.log('[Narrative] Lancement de l\'exercice Cœur de givre');
    
    // Charger les modules (en utilisant des chemins relatifs)
    const HeartOfFrostExercise = require('./exercises/heartOfFrost');
    const HeartOfFrostInterface = require('./exercises/heartOfFrostInterface');
    
    // Créer ou réutiliser le conteneur
    let exerciseContainer = document.getElementById('exercise-container');
    if (!exerciseContainer) {
      exerciseContainer = document.createElement('div');
      exerciseContainer.id = 'exercise-container';
      exerciseContainer.className = 'exercise-container';
      
      // Ajouter au DOM (adapter selon votre structure)
      if (dialogueSystem && dialogueSystem.container) {
        dialogueSystem.container.parentNode.appendChild(exerciseContainer);
      } else {
        document.body.appendChild(exerciseContainer);
      }
    }
    
    // Créer l'interface
    const interface = new HeartOfFrostInterface(exerciseContainer);
    interface.create();
    
    // Créer l'exercice
    const exercise = new HeartOfFrostExercise();
    
    // Vérifier et établir la connexion avec le système audio
    let audioSystemReady = false;
    if (window.audioSystem) {
      console.log('[HeartOfFrost] Connexion avec le système audio établie');
      audioSystemReady = true;
      
      // Vérifier si un fichier audio est déjà chargé
      const audioLoaded = window.audioSystem.isAudioBufferLoaded ? window.audioSystem.isAudioBufferLoaded() : false;
      
      if (!audioLoaded) {
        // Afficher un message pour inviter l'utilisateur à charger un fichier
        interface.showFeedback("Veuillez charger un fichier audio dans l'onglet principal avant de commencer l'exercice", "info");
        
        // Ajouter un bouton pour basculer vers l'onglet principal où se trouvent maintenant les contrôles audio
        const loadAudioBtn = document.createElement('button');
        loadAudioBtn.className = 'btn-load-audio';
        loadAudioBtn.textContent = "Charger un fichier audio";
        loadAudioBtn.style.backgroundColor = '#3498db';
        loadAudioBtn.style.color = 'white';
        loadAudioBtn.style.padding = '10px 20px';
        loadAudioBtn.style.border = 'none';
        loadAudioBtn.style.borderRadius = '5px';
        loadAudioBtn.style.margin = '10px auto';
        loadAudioBtn.style.display = 'block';
        loadAudioBtn.style.cursor = 'pointer';
        
        loadAudioBtn.addEventListener('click', () => {
          // Basculer vers l'onglet principal où se trouvent maintenant les contrôles audio
          const mainTab = document.querySelector('[data-tab="mainTab"]');
          if (mainTab) {
            mainTab.click();
          }
        });
        
        exerciseContainer.appendChild(loadAudioBtn);
      } else {
        // Préparer le système audio pour l'exercice
        console.log('[HeartOfFrost] Fichier audio déjà chargé, préparation du contrôle');
        
        // Activer le mode boucle
        if (typeof window.audioSystem.setLoopPlayback === 'function') {
          window.audioSystem.setLoopPlayback(true);
          console.log('[HeartOfFrost] Mode boucle activé');
        }
        
        // S'assurer que les fonctions de contrôle audio existent
        if (typeof window.audioSystem.setPlaybackRate === 'function') {
          console.log('[HeartOfFrost] Contrôle de vitesse disponible');
        } else {
          console.warn('[HeartOfFrost] Contrôle de vitesse non disponible');
        }
        
        if (typeof window.audioSystem.setVolume === 'function') {
          console.log('[HeartOfFrost] Contrôle de volume disponible');
        } else {
          console.warn('[HeartOfFrost] Contrôle de volume non disponible');
        }
        
        // Démarrer la lecture
        setTimeout(() => {
          if (typeof window.audioSystem.startPlayback === 'function') {
            window.audioSystem.startPlayback();
            console.log('[HeartOfFrost] Lecture audio démarrée');
          }
        }, 500);
      }
    } else {
      console.warn('[HeartOfFrost] Système audio non disponible');
      interface.showFeedback("Système audio non disponible. Veuillez d'abord charger le module audio.", "info");
    }
    
    // Écouter les événements de l'exercice
    exercise.on('started', (data) => {
      console.log('[HeartOfFrost] Exercice démarré', data);
      interface.showFeedback('Commencez à faire tourner le capteur gauche !', 'info');
    });
    
    exercise.on('update', (data) => {
      interface.update(data);
      
      // Cette partie est maintenant gérée directement dans heartOfFrost.js
      // pour une meilleure réactivité
    });
    
    exercise.on('rotationComplete', (data) => {
      interface.onRotationComplete();
      console.log(`[HeartOfFrost] Rotation ${data.count}/${data.totalTarget}`);
      
      // Jouer un son spécial pour marquer la rotation
      narrativeEvents.emit('playRotationSound');
    });
    
    exercise.on('completed', (data) => {
      console.log('[HeartOfFrost] Exercice terminé', data);
      interface.showFeedback(`Excellent ! Score final: ${data.finalScore}%`, 'success');
      
      // Arrêter la lecture audio
      if (window.audioSystem && typeof window.audioSystem.isPlaybackActive === 'function' && window.audioSystem.isPlaybackActive()) {
        if (typeof window.audioSystem.stopPlayback === 'function') {
          window.audioSystem.stopPlayback();
        }
      }
      
      // Continuer la leçon après 3 secondes
      setTimeout(() => {
        exerciseContainer.style.display = 'none';
        if (lessonSystem && typeof lessonSystem.nextStep === 'function') {
          lessonSystem.nextStep();
        }
      }, 3000);
    });
    
    // Écouter l'événement de chargement de fichier audio pour reprendre l'exercice
    if (window.audioSystem && window.audioSystem.audioEvents) {
      const audioLoadListener = (data) => {
        console.log('[HeartOfFrost] Fichier audio chargé:', data.fileName);
        interface.showFeedback(`Fichier audio chargé: ${data.fileName}`, "info");
        
        // Supprimer le bouton de chargement s'il existe
        const loadBtn = exerciseContainer.querySelector('.btn-load-audio');
        if (loadBtn) {
          loadBtn.remove();
        }
        
        // Retourner à l'onglet principal après 1 seconde
        setTimeout(() => {
          const mainTab = document.querySelector('[data-tab="mainTab"]');
          if (mainTab) {
            mainTab.click();
          }
          
          // Préparer et démarrer la lecture
          if (window.audioSystem) {
            // Activer le mode boucle
            if (typeof window.audioSystem.setLoopPlayback === 'function') {
              window.audioSystem.setLoopPlayback(true);
            }
            
            // Démarrer la lecture
            if (typeof window.audioSystem.startPlayback === 'function') {
              window.audioSystem.startPlayback();
            }
            
            audioSystemReady = true;
            console.log('[HeartOfFrost] Système audio maintenant prêt pour l\'exercice');
          }
        }, 1000);
      };
      
      // Ajouter l'écouteur d'événement
      window.audioSystem.audioEvents.on('audioFileLoaded', audioLoadListener);
      
      // Nettoyer l'écouteur lorsque l'exercice est terminé
      const cleanupAudioListener = () => {
        if (window.audioSystem && window.audioSystem.audioEvents) {
          window.audioSystem.audioEvents.removeListener('audioFileLoaded', audioLoadListener);
        }
      };
      
      exercise.on('completed', cleanupAudioListener);
      exercise.on('stopped', cleanupAudioListener);
    }
    
    // Interval de mise à jour pour les capteurs
    const updateInterval = setInterval(() => {
      if (!exercise.isActive) {
        clearInterval(updateInterval);
        return;
      }
      
      // Obtenir les données des capteurs
      if (window.bluetoothModule && typeof window.bluetoothModule.getCurrentSensorValues === 'function') {
        const sensorData = window.bluetoothModule.getCurrentSensorValues();
        exercise.update(sensorData);
      }
    }, 50); // 20 Hz pour une détection fluide
    
    // Fonctions globales pour les boutons
    window.stopHeartOfFrost = () => {
      exercise.stop();
      clearInterval(updateInterval);
      exerciseContainer.style.display = 'none';
      
      if (window.audioSystem && typeof window.audioSystem.isPlaybackActive === 'function' && window.audioSystem.isPlaybackActive()) {
        if (typeof window.audioSystem.stopPlayback === 'function') {
          window.audioSystem.stopPlayback();
        }
      }
      
      // Nettoyer les écouteurs d'événements audio
      if (window.audioSystem && window.audioSystem.audioEvents) {
        window.audioSystem.audioEvents.removeAllListeners('audioFileLoaded');
      }
      
      narrativeEvents.emit('exerciseStopped', 'heartOfFrost');
    };
    
    window.resetHeartOfFrost = () => {
      exercise.reset();
      exercise.start();
      interface.showFeedback('Exercice redémarré !', 'info');
    };
    
    // Afficher le conteneur et démarrer
    exerciseContainer.style.display = 'block';
    exercise.start();
    
  } catch (error) {
    console.error('[Narrative] Erreur lors du lancement de Cœur de givre:', error);
  }
}

/**
 * Initialise le système narratif
 * @param {HTMLElement} container - Conteneur principal pour l'interface
 */
function initNarrativeSystem(container) {
    if (!container) {
        console.error('[Narrative] Conteneur non spécifié pour l\'interface narrative');
        return false;
    }
    
    console.log('[Narrative] Initialisation du système narratif');
    
    // S'assurer que lessonSystem.lessons est bien initialisé comme un tableau
    if (!Array.isArray(lessonSystem.lessons)) {
        console.log('[Narrative] Initialisation du tableau de leçons');
        lessonSystem.lessons = [];
    }
    
    // Créer le conteneur pour le système de dialogue
    const narrativeContainer = document.createElement('div');
    narrativeContainer.className = 'narrative-container';
    
    // Ajouter la section du guide
    const guideSection = document.createElement('div');
    guideSection.className = 'guide-section';
    guideSection.innerHTML = `
        <h2>Heart of Glass : Guide interactif</h2>
        <div class="lesson-selector">
            <label for="lesson-select">Sélectionnez une leçon :</label>
            <select id="lesson-select">
                <option value="">-- Choisir une leçon --</option>
            </select>
            <button id="start-lesson-btn">Démarrer</button>
        </div>
    `;
    narrativeContainer.appendChild(guideSection);
    
    // Ajouter le conteneur de dialogue
    const dialogueContainerElement = document.createElement('div');
    dialogueContainerElement.id = 'dialogue-container';
    dialogueContainerElement.className = 'dialogue-container';
    narrativeContainer.appendChild(dialogueContainerElement);
    
    // Ajouter à la page
    container.appendChild(narrativeContainer);
    
    // Initialiser le système de dialogue
    dialogueSystem.setup(dialogueContainerElement);
    
    // Charger les leçons (fallback sur les scénarios existants si aucun fichier n'est trouvé)
    const lessonsFilePath = path.join(process.cwd(), 'assets', 'scenarios', 'intro.json');
    lessonSystem.loadLessons(lessonsFilePath);
    
    // Remplir le sélecteur de leçons
    populateLessonSelector();
    
    // Ajouter le gestionnaire pour le bouton de démarrage
    const startLessonBtn = document.getElementById('start-lesson-btn');
    if (startLessonBtn) {
        startLessonBtn.addEventListener('click', () => {
            const lessonSelect = document.getElementById('lesson-select');
            const selectedLesson = lessonSelect.value;
            
            if (selectedLesson) {
                lessonSystem.startLesson(selectedLesson);
            } else {
                dialogueSystem.addDialogue('Guide', 'Veuillez sélectionner une leçon pour commencer.');
            }
        });
    }
    
    narrativeEvents.emit('narrativeSystemInitialized');
    return true;
}

/**
 * Remplit le sélecteur de leçons
 */
function populateLessonSelector() {
    const lessonSelect = document.getElementById('lesson-select');
    if (!lessonSelect) return;
    
    // Vider le sélecteur
    lessonSelect.innerHTML = '<option value="">-- Choisir une leçon --</option>';
    
    // Vérifier que lessons est bien un tableau
    if (!Array.isArray(lessonSystem.lessons)) {
        console.error('[Narrative] lessonSystem.lessons n\'est pas un tableau dans populateLessonSelector:', lessonSystem.lessons);
        
        // Initialiser comme tableau vide si ce n'est pas un tableau
        lessonSystem.lessons = [];
        
        // Ajouter manuellement les leçons
        lessonSystem.addHeartOfFrostLesson();
        lessonSystem.addBluetoothConnectionLesson();
    }
    
    // Ajouter les options pour chaque leçon
    lessonSystem.lessons.forEach(lesson => {
        if (lesson && lesson.id && lesson.title) {
            const option = document.createElement('option');
            option.value = lesson.id;
            option.textContent = lesson.title;
            lessonSelect.appendChild(option);
        }
    });
    
    console.log(`[Narrative] ${lessonSystem.lessons.length} leçons chargées dans le sélecteur`);
}

// Gestionnaire pour le chargement de leçons
narrativeEvents.on('lessonsLoaded', () => {
    populateLessonSelector();
});

// Fonction de test pour le système de dialogue
function testDialogue() {
    dialogueSystem.addDialogue('Guide', 'Bienvenue dans Heart of Glass !');
    dialogueSystem.addDialogue('Guide', 'Je vais vous apprendre à utiliser les capteurs pour contrôler le son.');
    dialogueSystem.addDialogue('Guide', 'Commençons par un exercice simple : inclinez le capteur gauche pour modifier la vitesse de lecture.');
}

// Exporter les fonctions et objets du module
module.exports = {
    initNarrativeSystem,
    dialogueSystem,
    lessonSystem,
    narrativeEvents,
    testDialogue
};