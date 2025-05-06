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
            const lessonsData = fs.readFileSync(filePath, 'utf8');
            this.lessons = JSON.parse(lessonsData);
            console.log(`[Narrative] ${this.lessons.length} leçons chargées`);
            narrativeEvents.emit('lessonsLoaded', this.lessons);
            return true;
        } catch (error) {
            console.error('[Narrative] Erreur lors du chargement des leçons:', error);
            
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
        
        console.log('[Narrative] Leçons par défaut créées');
        narrativeEvents.emit('lessonsLoaded', this.lessons);
    },
    
    // Démarrer une leçon spécifique
    startLesson(lessonId) {
        const lesson = this.lessons.find(l => l.id === lessonId);
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
            // Créer une interface pour l'exercice
            this.showExerciseInterface(step);
            
            // Émettre un événement pour notifier le système audio
            narrativeEvents.emit('exerciseStarted', step);
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
 * Initialise le système narratif
 * @param {HTMLElement} container - Conteneur principal pour l'interface
 */
function initNarrativeSystem(container) {
    if (!container) {
        console.error('[Narrative] Conteneur non spécifié pour l\'interface narrative');
        return false;
    }
    
    console.log('[Narrative] Initialisation du système narratif');
    
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
    
    // Ajouter les options pour chaque leçon
    lessonSystem.lessons.forEach(lesson => {
        const option = document.createElement('option');
        option.value = lesson.id;
        option.textContent = lesson.title;
        lessonSelect.appendChild(option);
    });
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