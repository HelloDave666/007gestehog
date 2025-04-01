const noble = require('@abandonware/noble')

// Variables globales pour les capteurs et l'interface
let isScanning = false
const scanButton = document.getElementById('scanButton')
const deviceList = document.getElementById('deviceList')
const connectedDevices = new Set()
const sensorsWithData = new Set() // Pour suivre les capteurs qui affichent des données

// IDs des capteurs - peuvent être modifiés depuis les paramètres
let SENSOR_LEFT = 'ce:de:c2:f5:17:be'
let SENSOR_RIGHT = 'f0:70:c4:de:d1:22'
const LEFT_COLOR = 'blue'
const RIGHT_COLOR = 'green'

const READ_BATTERY_CMD = Buffer.from([0xFF, 0xAA, 0x27, 0x64, 0x00])

const calibrationOffsets = new Map()

// Variables pour les capteurs
let leftSensorData = { x: 0, y: 0, z: 0 }
let rightSensorData = { x: 0, y: 0, z: 0 }

// Variables pour le lissage (easing)
let targetValues = {
    leftX: 0, leftY: 0, leftZ: 0,
    rightX: 0, rightY: 0, rightZ: 0
}

let currentValues = {
    leftX: 0, leftY: 0, leftZ: 0,
    rightX: 0, rightY: 0, rightZ: 0
}

// Variables pour suivre les dernières valeurs d'angle (pour éviter les sauts)
let lastLeftY = 0
let lastRightY = 0
let jumpProtectionActive = false

// Facteur d'easing (entre 0 et 1)
// Plus la valeur est faible, plus le lissage est important (0.05 = très lisse, 0.2 = plus réactif)
const EASING_FACTOR = 0.08

// ID de la boucle d'animation
let animationFrameId = null

// --- Variables pour le système audio mode vinyle ---
let audioElement = null
let audioContext = null
let audioBuffer = null
let playbackPosition = 0
let isPlaying = false
let playDirection = 1
let playbackRate = 1.0
let currentVolume = 1.0
let lastFrameTime = 0
let audioFrameId = null

// Nouvelles variables pour l'enregistrement et la sensibilité
let mediaRecorder = null
let recordedChunks = []
let isRecording = false
let isProcessingRecording = false // Flag pour éviter les doublons de fenêtres
let SENSITIVITY_FACTOR = 1.0      // Facteur de sensibilité pour les capteurs

// Paramètres optimisés pour une meilleure qualité audio
let GRAIN_SIZE = 0.35        // Taille des grains (350ms)
let OVERLAP = 0.92           // Chevauchement (92%)
const UPDATE_RATE = 60         // Taux de mise à jour (60Hz)
const UPDATE_INTERVAL = 1000 / UPDATE_RATE
const MAX_ACTIVE_GRAINS = 8    // Limite de grains actifs
let WINDOW_TYPE = 'hann'     // Type de fenêtre d'apodisation

// Variables pour la lecture en boucle
let loopPlayback = true        // Par défaut activé
let isLoopTransitioning = false // Indicateur de transition de boucle en cours
let loopTransitionDuration = 0.25 // Durée de la transition de boucle (en secondes)

// Chaîne de traitement audio
let filterNode = null
let pendingGrainFlag = false

// File d'attente pour les sources audio
let audioSources = []

// SYSTÈME DE DIALOGUE
const dialogueSystem = {
    queue: [],              // File d'attente des dialogues
    isActive: false,        // Si un dialogue est en cours
    textSpeed: 40,          // Vitesse d'apparition des caractères (ms)
    currentCharIndex: 0,    // Index du caractère actuel
    currentDialogue: null,  // Dialogue en cours
    
    // Ajouter un dialogue à la file
    addDialogue(speaker, text, expression = 'neutral', callback = null) {
        this.queue.push({ speaker, text, expression, callback });
        
        // Afficher le conteneur de dialogue
        document.querySelector('.dialogue-container').style.display = 'flex';
        
        // Si aucun dialogue n'est actif, démarrer la séquence
        if (!this.isActive) {
            this.nextDialogue();
        }
    },
    
    // Passer au dialogue suivant
    nextDialogue() {
        if (this.queue.length === 0) {
            this.isActive = false;
            document.querySelector('.dialogue-container').style.display = 'none';
            return;
        }
        
        this.isActive = true;
        this.currentDialogue = this.queue.shift();
        this.currentCharIndex = 0;
        
        // Mettre à jour le portrait (lorsque les images seront disponibles)
        const portraitImg = document.getElementById('character-image');
        if (portraitImg) {
            // À l'avenir, utilisez: portraitImg.src = `./assets/${this.currentDialogue.speaker.toLowerCase()}_${this.currentDialogue.expression}.png`;
        }
        
        // Mettre à jour le nom
        document.getElementById('speaker-name').textContent = this.currentDialogue.speaker;
        
        // Vider le contenu du texte
        document.getElementById('dialogue-content').textContent = '';
        
        // Démarrer l'animation du texte
        this.animateText();
    },
    
    // Animer l'apparition du texte
    animateText() {
        if (this.currentCharIndex < this.currentDialogue.text.length) {
            const textElement = document.getElementById('dialogue-content');
            textElement.textContent = this.currentDialogue.text.substring(0, this.currentCharIndex + 1);
            
            this.currentCharIndex++;
            
            // Continuer l'animation
            setTimeout(() => this.animateText(), this.textSpeed);
        } else {
            // Animation terminée, montrer l'indicateur de continuation
            document.querySelector('.continue-indicator').style.display = 'block';
        }
    },
    
    // Accélérer ou compléter immédiatement le texte actuel
    speedUpText() {
        if (this.currentCharIndex < this.currentDialogue.text.length) {
            // Compléter immédiatement le texte
            document.getElementById('dialogue-content').textContent = this.currentDialogue.text;
            this.currentCharIndex = this.currentDialogue.text.length;
            document.querySelector('.continue-indicator').style.display = 'block';
        } else {
            // Passer au dialogue suivant
            if (this.currentDialogue.callback) {
                this.currentDialogue.callback();
            }
            this.nextDialogue();
        }
    }
};

// Gestionnaire d'état Bluetooth
noble.on('stateChange', async (state) => {
    if (state === 'poweredOn') {
        console.log('[Bluetooth] État: prêt')
    } else {
        console.log('[Bluetooth] État:', state)
    }
})

// Gestionnaire du bouton de scan
scanButton.addEventListener('click', () => {
    console.log('[UI] Clic sur le bouton scan')
    
    // Vérifier si les deux capteurs sont déjà opérationnels
    const bothSensorsActive = areBothSensorsActive()
    
    if (bothSensorsActive) {
        console.log('[Scanner] Les capteurs sont déjà connectés et fonctionnels. Scan non nécessaire.')
        // Optionnel: Afficher une notification à l'utilisateur
        alert('Les capteurs sont déjà connectés et fonctionnels.')
        return
    }
    
    if (!isScanning) {
        startScanning()
    } else {
        stopScanning()
    }
})

// Fonction pour vérifier si les deux capteurs sont actifs
function areBothSensorsActive() {
    return connectedDevices.has(SENSOR_LEFT.toLowerCase()) && 
           connectedDevices.has(SENSOR_RIGHT.toLowerCase()) &&
           sensorsWithData.has(SENSOR_LEFT.toLowerCase()) && 
           sensorsWithData.has(SENSOR_RIGHT.toLowerCase())
}

// Fonction pour vérifier si les deux capteurs sont connectés et affichent des données
function checkSensorsReadyAndStopScan() {
    const bothActive = areBothSensorsActive()
    
    console.log(`[État] Capteur gauche: ${connectedDevices.has(SENSOR_LEFT.toLowerCase()) ? 'connecté' : 'déconnecté'}, ${sensorsWithData.has(SENSOR_LEFT.toLowerCase()) ? 'données reçues' : 'pas de données'}`)
    console.log(`[État] Capteur droit: ${connectedDevices.has(SENSOR_RIGHT.toLowerCase()) ? 'connecté' : 'déconnecté'}, ${sensorsWithData.has(SENSOR_RIGHT.toLowerCase()) ? 'données reçues' : 'pas de données'}`)
    
    if (bothActive) {
        // Les capteurs sont actifs, mettre à jour le bouton dans tous les cas
        enableScanButton("Capteurs trouvés", "#3498db", false) // Bleu, non cliquable
        
        // Si le scan est en cours, l'arrêter
        if (isScanning) {
            console.log('[Scanner] Les deux capteurs sont opérationnels, arrêt automatique du scan')
            stopScanning()
        }
        return true
    }
    return false
}

// Fonction d'interpolation linéaire (lerp) pour le lissage
function lerp(start, end, factor) {
    return start + (end - start) * factor
}

// Fonction pour détecter les sauts brusques d'angle
function detectAngleJump(currentAngle, lastAngle) {
    // Si la différence entre les angles est supérieure à 270 degrés, c'est probablement un saut de -180 à +180 ou vice versa
    const diff = Math.abs(currentAngle - lastAngle)
    return diff > 270
}

// Fonction pour convertir l'angle en valeur normalisée entre -1 et 1
function angleToNormalizedValue(angle) {
    // Plage d'angle maximale (±90 degrés)
    const maxAngle = 90
    
    // Saturer l'angle dans la plage -maxAngle à +maxAngle
    const clampedAngle = Math.max(-maxAngle, Math.min(maxAngle, angle))
    
    // Normaliser à la plage -1 à 1
    return clampedAngle / maxAngle
}

// Démarrer la boucle d'animation pour le lissage
function startAnimationLoop() {
    if (animationFrameId) return // Éviter les doublons
    
    let lastTimestamp = performance.now()
    
    function animate(timestamp) {
        // Calculer le delta time (en secondes)
        const deltaTime = (timestamp - lastTimestamp) / 1000
        lastTimestamp = timestamp
        
        // Mettre à jour les valeurs actuelles avec un effet de lissage
        currentValues.leftX = lerp(currentValues.leftX, targetValues.leftX, EASING_FACTOR)
        currentValues.leftY = lerp(currentValues.leftY, targetValues.leftY, EASING_FACTOR)
        currentValues.leftZ = lerp(currentValues.leftZ, targetValues.leftZ, EASING_FACTOR)
        
        currentValues.rightX = lerp(currentValues.rightX, targetValues.rightX, EASING_FACTOR)
        currentValues.rightY = lerp(currentValues.rightY, targetValues.rightY, EASING_FACTOR)
        currentValues.rightZ = lerp(currentValues.rightZ, targetValues.rightZ, EASING_FACTOR)
        
        // Vérifier les sauts d'angle
        if (detectAngleJump(currentValues.leftY, lastLeftY) || 
            detectAngleJump(currentValues.rightY, lastRightY)) {
            console.log("[Angles] Saut d'angle détecté, activation protection")
            jumpProtectionActive = true
            
            // Réactiver après un délai
            setTimeout(() => {
                jumpProtectionActive = false
                console.log("[Angles] Protection désactivée")
            }, 1000)
        }
        
        // Stocker les dernières valeurs
        lastLeftY = currentValues.leftY
        lastRightY = currentValues.rightY
        
        // Mettre à jour les contrôles audio seulement si la protection n'est pas active
        if (!jumpProtectionActive) {
            updateAudioControls(deltaTime)
        }
        
        // Vérifier l'état des capteurs
        checkSensorsReadyAndStopScan()
        
        // Continuer la boucle d'animation
        animationFrameId = requestAnimationFrame(animate)
    }
    
    animationFrameId = requestAnimationFrame(animate)
    console.log('[Animation] Démarrage de la boucle de lissage')
}

// Arrêter la boucle d'animation
function stopAnimationLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
        console.log('[Animation] Arrêt de la boucle de lissage')
    }
}

// Désactiver le bouton de scan pendant la recherche
function disableScanButton() {
    if (!scanButton) return // Sécurité supplémentaire
    
    scanButton.disabled = true
    scanButton.style.backgroundColor = '#e74c3c' // Rouge
    scanButton.style.cursor = 'not-allowed'
    scanButton.textContent = 'Recherche en cours...'
    
    console.log('[UI] Bouton scan désactivé: Recherche en cours...')
}

// Mettre à jour l'état du bouton selon les paramètres
function enableScanButton(text = "Rechercher les capteurs", color = "#4CAF50", enabled = true) {
    if (!scanButton) return // Sécurité supplémentaire
    
    scanButton.disabled = !enabled
    scanButton.style.backgroundColor = color
    scanButton.style.cursor = enabled ? 'pointer' : 'not-allowed'
    scanButton.textContent = text
    
    console.log(`[UI] Bouton scan mis à jour: ${text}, couleur: ${color}, activé: ${enabled}`)
}

function createDeviceDisplay(position, color, address) {
    console.log(`[UI] Création affichage pour ${position} (${address})`)
    const deviceDiv = document.createElement('div')
    deviceDiv.className = 'device-info'
    deviceDiv.setAttribute('data-address', address)
    deviceDiv.innerHTML = `
        <div class="status-indicator status-disconnected"></div>
        <div class="info-basic">
            <h3 style="color: ${color}">Infos Bluetooth (${position})</h3>
            <p style="color: ${color}">Adresse: ${address}</p>
            <p style="color: ${color}">RSSI: --</p>
            <p style="color: ${color}">Force du signal: --%</p>
            <p style="color: ${color}">État de connexion: déconnecté</p>
            <p style="color: ${color}">Batterie: --%</p>
        </div>
        <div class="info-sensor">
            <h3>Données capteur</h3>
            <p style="color: ${color}">Roll (X): -- </p>
            <p style="color: ${color}">Pitch (Y): -- </p>
            <p style="color: ${color}">Yaw (Z): -- </p>
        </div>
    `
    return deviceDiv
}

function startScanning() {
    console.log('[Scanner] Démarrage du scan')
    isScanning = true
    disableScanButton()
    deviceList.innerHTML = ''
    calibrationOffsets.clear()
    connectedDevices.clear()
    sensorsWithData.clear()
    
    // Réinitialiser les valeurs des capteurs
    targetValues = { leftX: 0, leftY: 0, leftZ: 0, rightX: 0, rightY: 0, rightZ: 0 }
    currentValues = { leftX: 0, leftY: 0, leftZ: 0, rightX: 0, rightY: 0, rightZ: 0 }
    lastLeftY = 0
    lastRightY = 0
    jumpProtectionActive = false
    
    // Arrêter l'animation si elle est en cours
    stopAnimationLoop()
    
    deviceList.appendChild(createDeviceDisplay('GAUCHE', LEFT_COLOR, SENSOR_LEFT))
    deviceList.appendChild(createDeviceDisplay('DROIT', RIGHT_COLOR, SENSOR_RIGHT))
    
    noble.startScanning()
}

function stopScanning() {
    console.log('[Scanner] Arrêt du scan')
    isScanning = false
    noble.stopScanning()
}

function updateDeviceStatus(deviceDiv, connected, color) {
    if (!deviceDiv) {
        console.error('[UI] updateDeviceStatus: deviceDiv non trouvé')
        return
    }

    console.log(`[UI] Mise à jour statut: ${connected ? 'connecté' : 'déconnecté'}`)
    const indicator = deviceDiv.querySelector('.status-indicator')
    indicator.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`
    
    const stateText = deviceDiv.querySelector('.info-basic p:nth-child(5)')
    if (stateText) {
        stateText.style.color = color
        stateText.textContent = `État de connexion: ${connected ? 'connecté' : 'déconnecté'}`
    } else {
        console.error('[UI] updateDeviceStatus: élément état non trouvé')
    }
}

function updateDeviceInfo(deviceDiv, peripheral) {
    if (!deviceDiv) {
        console.error('[UI] updateDeviceInfo: deviceDiv non trouvé')
        return
    }
    
    console.log(`[UI] Mise à jour infos pour: ${peripheral.address}`)
    const color = peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase() ? LEFT_COLOR : RIGHT_COLOR
    
    const infoBasic = deviceDiv.querySelector('.info-basic')
    if (!infoBasic) {
        console.error('[UI] updateDeviceInfo: .info-basic non trouvé')
        return
    }

    // Préserver la valeur de batterie si c'est le capteur gauche
    let batteryText = 'Batterie: --%'
    if (peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase()) {
        const batteryElement = deviceDiv.querySelector('.info-basic p:nth-child(6)')
        if (batteryElement) {
            batteryText = batteryElement.textContent
        }
    }

    infoBasic.innerHTML = `
        <h3 style="color: ${color}">Infos Bluetooth (${getSensorInfo(peripheral.address).position})</h3>
        <p style="color: ${color}">Adresse: ${peripheral.address}</p>
        <p style="color: ${color}">RSSI: ${peripheral.rssi}dBm</p>
        <p style="color: ${color}">Force du signal: ${Math.abs(peripheral.rssi)}%</p>
        <p style="color: ${color}">État de connexion: ${peripheral.state}</p>
        <p style="color: ${color}">${batteryText}</p>
    `
}

function updateBatteryLevel(deviceDiv, data) {
    if (!deviceDiv || data.length < 6) {
        console.error('[Batterie] Données invalides:', !deviceDiv ? 'deviceDiv manquant' : 'données trop courtes')
        return
    }
    
    if (data[0] === 0x55 && data[1] === 0x71 && data[2] === 0x64) {
        const batteryValue = (data[5] << 8) | data[4]
        let percentage = 0
        
        if (batteryValue > 830) percentage = 100
        else if (batteryValue > 393) percentage = 90
        else if (batteryValue > 387) percentage = 75
        else if (batteryValue > 382) percentage = 60
        else if (batteryValue > 379) percentage = 50
        else if (batteryValue > 377) percentage = 40
        else if (batteryValue > 373) percentage = 30
        else if (batteryValue > 370) percentage = 20
        else if (batteryValue > 368) percentage = 15
        else if (batteryValue > 350) percentage = 10
        else if (batteryValue > 340) percentage = 5

        const address = deviceDiv.getAttribute('data-address')
        console.log(`[Batterie] Valeur: ${batteryValue}, Pourcentage: ${percentage}% pour ${address}`)
        
        const batteryText = deviceDiv.querySelector('.info-basic p:nth-child(6)')
        if (batteryText) {
            const color = address.toLowerCase() === SENSOR_LEFT.toLowerCase() ? LEFT_COLOR : RIGHT_COLOR
            batteryText.style.color = color
            batteryText.textContent = `Batterie: ${percentage}%`
        } else {
            console.error('[Batterie] Élément batterie non trouvé dans le DOM')
        }
    }
}

function getSensorInfo(address) {
    const addrLower = address.toLowerCase()
    if (addrLower === SENSOR_LEFT.toLowerCase()) return { position: 'GAUCHE', color: LEFT_COLOR }
    if (addrLower === SENSOR_RIGHT.toLowerCase()) return { position: 'DROIT', color: RIGHT_COLOR }
    return { position: 'INCONNU', color: 'black' }
}

function normalizeAngle(angle, preserveFullRange = false) {
    // Si on veut préserver la plage complète (-180 à +180)
    if (preserveFullRange) {
        while (angle > 180) angle -= 360
        while (angle < -180) angle += 360
        return angle
    }
    
    // Sinon, normaliser entre 0 et 360 (pour éviter les valeurs négatives)
    angle = angle % 360
    if (angle < 0) angle += 360
    return angle
}

function processData(data, address) {
    if (!data || data.length < 20) {
        console.error('[Données] Données invalides pour:', address)
        return null
    }

    let angles = {
        x: ((data[15] << 8 | data[14]) / 32768 * 180),
        y: ((data[17] << 8 | data[16]) / 32768 * 180),
        z: ((data[19] << 8 | data[18]) / 32768 * 180)
    }

    if (!calibrationOffsets.has(address)) {
        console.log('[Calibration] Nouvelle calibration pour:', address)
        calibrationOffsets.set(address, {
            x: angles.x,
            y: angles.y,
            z: angles.z
        })
    }

    const offsets = calibrationOffsets.get(address)
    const normalizedAngles = {
        x: normalizeAngle(angles.x - offsets.x, true),
        y: normalizeAngle(angles.y - offsets.y, true),
        z: normalizeAngle(angles.z - offsets.z, true)
    }

    // Mettre à jour les valeurs cibles au lieu des valeurs actuelles
    if (address.toLowerCase() === SENSOR_LEFT.toLowerCase()) {
        targetValues.leftX = normalizedAngles.x
        targetValues.leftY = normalizedAngles.y
        targetValues.leftZ = normalizedAngles.z
    } else if (address.toLowerCase() === SENSOR_RIGHT.toLowerCase()) {
        targetValues.rightX = normalizedAngles.x
        targetValues.rightY = normalizedAngles.y
        targetValues.rightZ = normalizedAngles.z
    }

    // Marquer ce capteur comme ayant des données
    sensorsWithData.add(address.toLowerCase())
    
    // Vérifier si les deux capteurs sont actifs et démarrer l'animation si nécessaire
    if (areBothSensorsActive() && !animationFrameId) {
        startAnimationLoop()
    }
    
    // Vérifier l'état des capteurs après chaque mise à jour
    checkSensorsReadyAndStopScan()

    return {
        x: normalizedAngles.x.toFixed(1),
        y: normalizedAngles.y.toFixed(1),
        z: normalizedAngles.z.toFixed(1)
    }
}

// Détection et gestion des capteurs Bluetooth
noble.on('discover', (peripheral) => {
    if (peripheral.advertisement.localName?.includes('WT901BLE67')) {
        console.log('[Découverte] Capteur trouvé:', peripheral.address)
        const deviceDiv = document.querySelector(`[data-address="${peripheral.address}"]`)
        const color = peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase() ? LEFT_COLOR : RIGHT_COLOR
        
        if (!connectedDevices.has(peripheral.address.toLowerCase()) && peripheral.state !== 'connected') {
            peripheral.connect(error => {
                if (error) {
                    console.error('[Connexion] Erreur:', error)
                    if (deviceDiv) {
                        updateDeviceStatus(deviceDiv, false, color)
                    }
                    return
                }
                
                console.log('[Connexion] Réussie pour:', peripheral.advertisement.localName)
                
                if (deviceDiv) {
                    updateDeviceStatus(deviceDiv, true, color)
                    updateDeviceInfo(deviceDiv, peripheral)
                }
                
                connectedDevices.add(peripheral.address.toLowerCase())
                
                // Vérifier si les deux capteurs sont connectés et affichent des données
                checkSensorsReadyAndStopScan()

                peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
                    if (error) {
                        console.error('[Services] Erreur découverte:', error)
                        return
                    }

                    console.log('[Services] Découverts pour:', peripheral.address)
                    
                    // Envoi de la commande batterie uniquement pour le capteur gauche
                    if (peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase() && characteristics.length > 0) {
                        characteristics[0].write(READ_BATTERY_CMD, true, (error) => {
                            if (error) console.error('[Batterie] Erreur lecture:', error)
                        })
                    }

                    characteristics.forEach(characteristic => {
                        characteristic.notify(true, (error) => {
                            if (error) {
                                console.error('[Notification] Erreur:', error)
                                return
                            }
                            
                            characteristic.on('data', (data) => {
                                if (!data || data.length < 1) return
                                
                                if (data[0] === 0x55) {
                                    // Traiter les données de batterie seulement pour le capteur gauche
                                    if (data[1] === 0x71 && peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase()) {
                                        console.log('[Données] Batterie reçues pour capteur gauche')
                                        updateBatteryLevel(deviceDiv, data)
                                    }
                                    // Traiter les données d'angle pour les deux capteurs
                                    else if (data[1] === 0x61) {
                                        const sensorData = processData(data, peripheral.address)
                                        if (sensorData && deviceDiv) {
                                            const sensorDataDiv = deviceDiv.querySelector('.info-sensor')
                                            sensorDataDiv.innerHTML = `
                                                <h3>Données capteur</h3>
                                                <p style="color: ${color}">Roll (X): ${sensorData.x}°</p>
                                                <p style="color: ${color}">Pitch (Y): ${sensorData.y}°</p>
                                                <p style="color: ${color}">Yaw (Z): ${sensorData.z}°</p>
                                            `
                                        }
                                    }
                                }
                            })
                        })
                    })
                })
            })

            peripheral.once('disconnect', () => {
                console.log('[Déconnexion] Détectée pour:', peripheral.address)
                connectedDevices.delete(peripheral.address.toLowerCase())
                sensorsWithData.delete(peripheral.address.toLowerCase())
                
                if (deviceDiv) {
                    updateDeviceStatus(deviceDiv, false, color)
                }
                
                // Arrêter la boucle d'animation si l'un des capteurs se déconnecte
                if (!areBothSensorsActive()) {
                    stopAnimationLoop()
                }
                
                // Réactiver le bouton si un capteur se déconnecte
                enableScanButton("Rechercher les capteurs", "#4CAF50", true)
            })
        }

        if (deviceDiv) {
            updateDeviceInfo(deviceDiv, peripheral)
        }
    }
})

// --- SYSTÈME AUDIO AMÉLIORÉ AVEC LECTURE EN BOUCLE ET ENREGISTREMENT ---

// Créer une fenêtre d'apodisation pour éliminer les artefacts
function createWindow(type, length) {
    const window = new Float32Array(length);
    const factor = 2 * Math.PI / (length - 1);
    
    if (type === 'hann') {
        for (let i = 0; i < length; i++) {
            window[i] = 0.5 * (1 - Math.cos(i * factor));
        }
    } else if (type === 'hamming') {
        for (let i = 0; i < length; i++) {
            window[i] = 0.54 - 0.46 * Math.cos(i * factor);
        }
    } else if (type === 'rectangle') {
        for (let i = 0; i < length; i++) {
            window[i] = 1.0;
        }
    } else if (type === 'triangle') {
        for (let i = 0; i < length; i++) {
            window[i] = 1.0 - Math.abs((i - (length - 1) / 2) / ((length - 1) / 2));
        }
    } else {
        // Fenêtre simple par défaut
        for (let i = 0; i < length; i++) {
            if (i < length * 0.1 || i > length * 0.9) {
                const edge = i < length * 0.1 ? i / (length * 0.1) : (length - i) / (length * 0.1);
                window[i] = Math.sin(edge * Math.PI/2);
            } else {
                window[i] = 1.0;
            }
        }
    }
    
    return window;
}

// Créer la chaîne de traitement audio
function createAudioProcessingGraph() {
    if (!audioContext) return;
    
    try {
        // Filtre passe-bas pour adoucir les transitions
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 18000;
        filterNode.Q.value = 0.7;
        
        // Connexion au destination
        filterNode.connect(audioContext.destination);
        
        console.log('[Audio] Graphe de traitement audio créé');
    } catch (e) {
        console.error('[Audio] Erreur création graphe audio:', e);
        // Fallback simple en cas d'erreur
        audioContext.destination.connect(audioContext.destination);
    }
}

// Initialisation du système audio
function initAudio() {
    try {
        // Créer l'élément audio standard
        audioElement = document.createElement('audio');
        document.body.appendChild(audioElement);
        
        // Créer le contexte audio
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[Audio] Contexte audio créé');
        
        // Créer le graphe de traitement audio
        createAudioProcessingGraph();
    } catch (e) {
        console.error('[Audio] Erreur création contexte audio:', e);
    }
    
    try {
        // Trouver les références aux nouveaux éléments d'interface
        const fileInput = document.getElementById('audioFile');
        const playPauseButton = document.getElementById('playPauseButton');
        const recordButton = document.getElementById('recordButton');
        
        // Gestion du chargement de fichier
        if (fileInput) {
            fileInput.addEventListener('change', async function(e) {
                const file = e.target.files[0];
                if (!file) return;
                
                // Arrêter la lecture en cours
                stopAudio();
                
                // Charger le fichier pour l'élément audio standard
                const fileURL = URL.createObjectURL(file);
                audioElement.src = fileURL;
                audioElement.load();
                
                // Charger et décoder le fichier pour Web Audio API
                try {
                    const reader = new FileReader();
                    reader.onload = async function(event) {
                        try {
                            // Décoder les données audio
                            audioBuffer = await audioContext.decodeAudioData(event.target.result);
                            playbackPosition = 0;
                            
                            // Mettre à jour l'interface
                            updatePlaybackDisplay();
                            console.log(`[Audio] Fichier chargé et décodé: ${file.name}`);
                            
                            // Activer le bouton d'enregistrement
                            if (recordButton) {
                                recordButton.disabled = false;
                            }
                        } catch (decodeError) {
                            console.error('[Audio] Erreur lors du décodage:', decodeError);
                        }
                    };
                    
                    reader.onerror = function() {
                        console.error('[Audio] Erreur lecture fichier');
                    };
                    
                    reader.readAsArrayBuffer(file);
                } catch (error) {
                    console.error('[Audio] Erreur lors du chargement:', error);
                }
            });
        }
    } catch (initError) {
        console.error('[Audio] Erreur initialisation audio:', initError);
    }
}

// Fonctions pour l'enregistrement audio
function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!isPlaying || !audioContext || isRecording) return;
    
    console.log('[Audio] Démarrage de l\'enregistrement...');
    
    try {
        // Réinitialiser le flag et les chunks
        isProcessingRecording = false;
        recordedChunks = [];
        
        // Créer un flux audio à partir de la sortie audio
        const dest = audioContext.createMediaStreamDestination();
        filterNode.connect(dest);
        
        // Configuration des formats à tester par ordre de préférence (sans MP3)
        const supportedMimeTypes = [
            { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
            { mimeType: 'audio/webm', ext: 'webm' },
            { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
            { mimeType: 'audio/ogg', ext: 'ogg' },
            { mimeType: 'audio/wav', ext: 'wav' }
        ];
        
        // Trouver le premier format supporté
        let selectedFormat = null;
        for (const format of supportedMimeTypes) {
            if (MediaRecorder.isTypeSupported(format.mimeType)) {
                selectedFormat = format;
                console.log(`[Audio] Format supporté trouvé: ${format.mimeType} (extension: ${format.ext})`);
                break;
            }
        }
        
        // Options d'enregistrement
        let options = {};
        if (selectedFormat) {
            options.mimeType = selectedFormat.mimeType;
        }
        
        // Qualité maximale possible
        options.audioBitsPerSecond = 320000; // 320 kbps
        
        console.log(`[Audio] Configuration d'enregistrement: ${JSON.stringify(options)}`);
        
        // Créer l'enregistreur
        mediaRecorder = new MediaRecorder(dest.stream, options);
        
        // Collecte fréquente des chunks pour assurer la qualité des métadonnées
        mediaRecorder.ondataavailable = function(event) {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async function() {
            // Protection contre les appels multiples
            if (isProcessingRecording) {
                console.log('[Audio] Traitement d\'enregistrement déjà en cours, ignorer');
                return;
            }
            
            isProcessingRecording = true;
            console.log(`[Audio] Fin de l'enregistrement, ${recordedChunks.length} chunks collectés`);
            
            try {
                if (recordedChunks.length === 0) {
                    console.error('[Audio] Aucune donnée enregistrée');
                    isProcessingRecording = false;
                    return;
                }
                
                // Créer le blob avec les données enregistrées
                const finalBlob = new Blob(recordedChunks, { 
                    type: mediaRecorder.mimeType || 'audio/webm'
                });
                
                console.log(`[Audio] Blob final créé: ${finalBlob.size} octets, type: ${finalBlob.type}`);
                
                // Déterminer l'extension de fichier appropriée
                let extension = 'webm';
                if (finalBlob.type.includes('ogg')) extension = 'ogg';
                if (finalBlob.type.includes('wav')) extension = 'wav';
                
                // Téléchargement immédiat
                const url = URL.createObjectURL(finalBlob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                
                // Générer un nom de fichier avec horodatage
                const date = new Date();
                const dateString = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
                a.download = `audio-recording-${dateString}.${extension}`;
                
                // Ajouter et déclencher immédiatement
                document.body.appendChild(a);
                a.click();
                
                // Nettoyage immédiat
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                console.log('[Audio] Téléchargement terminé et ressources nettoyées');
                
            } catch (error) {
                console.error('[Audio] Erreur lors du traitement de l\'enregistrement:', error);
            } finally {
                // Toujours réinitialiser le flag après traitement
                isProcessingRecording = false;
                recordedChunks = [];
            }
        };
        
        // Démarrer avec des chunks très fréquents
        mediaRecorder.start(20); // Collecte plus fréquente (20ms)
        isRecording = true;
        
        // Mise à jour de l'interface
        const recordButton = document.getElementById('recordButton');
        if (recordButton) {
            recordButton.classList.add('recording');
            const recordIcon = recordButton.querySelector('.record-icon');
            if (recordIcon) {
                recordIcon.style.backgroundColor = '#fff';
                recordIcon.style.animation = 'pulse 1s infinite';
            }
        }
        
        console.log('[Audio] Enregistrement démarré');
    } catch (error) {
        console.error('[Audio] Erreur lors du démarrage de l\'enregistrement:', error);
        alert('Erreur lors du démarrage de l\'enregistrement: ' + error.message);
    }
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    
    console.log('[Audio] Arrêt de l\'enregistrement...');
    
    try {
        // Vérifier que le MediaRecorder est dans un état où il peut être arrêté
        if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        
        // Mise à jour de l'interface
        const recordButton = document.getElementById('recordButton');
        if (recordButton) {
            recordButton.classList.remove('recording');
            const recordIcon = recordButton.querySelector('.record-icon');
            if (recordIcon) {
                recordIcon.style.backgroundColor = '#fff';
                recordIcon.style.animation = 'none';
            }
        }
    } catch (error) {
        console.error('[Audio] Erreur lors de l\'arrêt de l\'enregistrement:', error);
        isProcessingRecording = false; // Réinitialiser en cas d'erreur
    }
}

// Adapter le filtre en fonction de la vitesse
function updateFilter() {
    if (!filterNode) return;
    
    // Ajuster le filtre passe-bas en fonction de la vitesse
    // Plus la vitesse est élevée, plus on filtre les hautes fréquences
    if (Math.abs(playbackRate) > 2.0) {
        const filterFreq = 21000 - (Math.abs(playbackRate) - 2.0) * 2000;
        filterNode.frequency.value = Math.max(8000, filterFreq);
        filterNode.Q.value = Math.min(1.0, Math.abs(playbackRate) / 3);
    } else {
        // À vitesse normale ou lente, garder une fréquence haute (peu d'effet)
        filterNode.frequency.value = 20000;
        filterNode.Q.value = 0.5;
    }
}

// Nettoyer les sources terminées
function cleanupEndedSources() {
    const now = audioContext.currentTime;
    audioSources = audioSources.filter(source => {
        if (source.endTime < now) {
            try {
                // Déconnecter et nettoyer
                if (source.gainNode) {
                    source.gainNode.disconnect();
                }
                source.disconnect();
            } catch (e) {
                // Ignorer les erreurs
            }
            return false; // Supprimer de la file
        }
        return true; // Garder dans la file
    });
}

// Planifier le grain audio avec gestion de boucle améliorée
function scheduleGrain() {
    if (!isPlaying || !audioBuffer) return;
    
    try {
        // Nettoyer les sources terminées
        cleanupEndedSources();
        
        // Si trop de grains actifs, reporter
        if (audioSources.length >= MAX_ACTIVE_GRAINS) {
            return;
        }
        
        // Paramètres du grain
        const grainSize = GRAIN_SIZE;
        const absRate = Math.abs(playbackRate);
        
        // Position actuelle avec légère variation aléatoire pour réduire les artefacts
        let grainPosition = playbackPosition + (Math.random() * 0.01 - 0.005);
        
        // === GESTION AMÉLIORÉE DES LIMITES EN MODE BOUCLE ===
        let isTransitionGrain = false;  // Indique si ce grain est un grain de transition
        
        if (loopPlayback) {
            // Détecter si nous approchons d'une limite pour préparer une transition
            const approachingStart = grainPosition < grainSize && playDirection < 0;
            const approachingEnd = (grainPosition + grainSize) > audioBuffer.duration && playDirection > 0;
            
            if (approachingStart || approachingEnd) {
                // Marquer la transition
                isLoopTransitioning = true;
                isTransitionGrain = true;
                
                if (approachingStart) {
                    // Lecture arrière approchant le début: préparer le grain de fin
                    const grainPositionFromEnd = audioBuffer.duration - Math.abs(grainPosition);
                    if (grainPosition < 0) {
                        // Déjà passé sous zéro, utiliser la position depuis la fin
                        grainPosition = grainPositionFromEnd;
                    } else {
                        // Planifier un grain supplémentaire à la fin pour assurer une transition fluide
                        scheduleTransitionGrain(grainPositionFromEnd, absRate);
                    }
                }
                else if (approachingEnd) {
                    // Lecture avant approchant la fin: préparer le grain de début
                    const grainPositionFromStart = grainPosition - audioBuffer.duration;
                    if (grainPosition >= audioBuffer.duration) {
                        // Déjà dépassé la fin, utiliser la position depuis le début
                        grainPosition = grainPositionFromStart;
                    } else {
                        // Planifier un grain supplémentaire au début pour assurer une transition fluide
                        scheduleTransitionGrain(grainPositionFromStart, absRate);
                    }
                }
            }
            else {
                // Hors zone de transition, ajustement normal des limites
                if (grainPosition < 0) {
                    grainPosition = audioBuffer.duration + grainPosition;
                } else if (grainPosition >= audioBuffer.duration) {
                    grainPosition = grainPosition - audioBuffer.duration;
                }
                
                // Fin de la transition si nous étions dedans
                if (isLoopTransitioning) {
                    isLoopTransitioning = false;
                }
            }
        } else {
            // Mode sans boucle: vérifier les limites
            if (grainPosition < 0) {
                grainPosition = 0;
            } else if (grainPosition >= audioBuffer.duration) {
                grainPosition = audioBuffer.duration - 0.01;
            }
        }
        
        // Calculer la durée disponible à cette position
        let availableDuration = grainSize;
        if (grainPosition + availableDuration > audioBuffer.duration) {
            if (loopPlayback) {
                // En mode boucle, on prend ce qui reste
                availableDuration = audioBuffer.duration - grainPosition;
            } else {
                availableDuration = audioBuffer.duration - grainPosition;
            }
        }
        
        if (availableDuration < 0.05) return; // Éviter les grains trop courts
        
        // Créer une nouvelle source et un nœud de gain
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = absRate;
        
        const gainNode = audioContext.createGain();
        source.connect(gainNode);
        
        if (filterNode) {
            gainNode.connect(filterNode);
        } else {
            gainNode.connect(audioContext.destination);
        }
        
        // Timings précis
        const currentTime = audioContext.currentTime;
        const startTime = currentTime + 0.005;
        const grainDuration = availableDuration / absRate;
        const stopTime = startTime + grainDuration;
        
        // Créer une fenêtre d'apodisation pour éviter les clics
        const windowSamples = 100;
        const windowCurve = createWindow(WINDOW_TYPE, windowSamples);
        
        // Remplir le tableau d'automation pour la courbe complète
        const fadeSteps = windowSamples * 2 + 1;
        const fullGainCurve = new Float32Array(fadeSteps);
        
        // Appliquer la fenêtre
        for (let i = 0; i < windowSamples; i++) {
            fullGainCurve[i] = windowCurve[i] * currentVolume;
        }
        
        for (let i = windowSamples; i < windowSamples + 1; i++) {
            fullGainCurve[i] = currentVolume;
        }
        
        for (let i = 0; i < windowSamples; i++) {
            fullGainCurve[windowSamples + 1 + i] = windowCurve[windowSamples - 1 - i] * currentVolume;
        }
        
        // Appliquer la courbe de gain
        try {
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.setValueCurveAtTime(fullGainCurve, startTime, grainDuration);
        } catch (e) {
            // Fallback linéaire en cas d'erreur
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(currentVolume, startTime + grainDuration * 0.15);
            gainNode.gain.setValueAtTime(currentVolume, startTime + grainDuration * 0.15);
            gainNode.gain.linearRampToValueAtTime(0, stopTime);
        }
        
        // Démarrer la lecture
        source.start(startTime, grainPosition, availableDuration);
        source.stop(stopTime);
        
        // Stocker les informations
        source.endTime = stopTime;
        source.gainNode = gainNode;
        source.grainPosition = grainPosition;
        source.isTransitionGrain = isTransitionGrain;
        audioSources.push(source);
        
        return true;
    } catch (error) {
        console.error('[Audio] Erreur lors de la planification du grain:', error);
        return false;
    }
}

// Planifier un grain de transition spécifique pour les boucles fluides
function scheduleTransitionGrain(position, rate) {
    if (!isPlaying || !audioBuffer || position < 0 || position >= audioBuffer.duration) return;
    
    try {
        // Paramètres du grain de transition
        let grainSize = GRAIN_SIZE * 1.2; // Légèrement plus grand pour une meilleure transition
        
        // Limiter la taille si nécessaire
        if (position + grainSize > audioBuffer.duration) {
            grainSize = audioBuffer.duration - position;
        }
        
        if (grainSize < 0.05) return; // Trop petit pour être utile
        
        // Créer source et gain
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        
        const gainNode = audioContext.createGain();
        source.connect(gainNode);
        
        if (filterNode) {
            gainNode.connect(filterNode);
        } else {
            gainNode.connect(audioContext.destination);
        }
        
        // Timing
        const currentTime = audioContext.currentTime;
        const startTime = currentTime + 0.005;
        const grainDuration = grainSize / rate;
        const stopTime = startTime + grainDuration;
        
        // Courbe de fondu spéciale pour les transitions
        const fadeTime = grainDuration * 0.4; // Longue transition
        
        // Volume légèrement réduit pour le grain de transition (mélange plus doux)
        const transitionVolume = currentVolume * 0.85;
        
        // Appliquer gain avec fondus
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(transitionVolume, startTime + fadeTime);
        gainNode.gain.linearRampToValueAtTime(0, stopTime);
        
        // Démarrer la lecture
        source.start(startTime, position, grainSize);
        source.stop(stopTime);
        
        // Stocker
        source.endTime = stopTime;
        source.gainNode = gainNode;
        source.grainPosition = position;
        source.isTransitionGrain = true;
        audioSources.push(source);
        
        return true;
    } catch (error) {
        console.error('[Audio] Erreur lors de la planification du grain de transition:', error);
        return false;
    }
}

// Planificateur audio principal
function scheduleAudioUpdate() {
    if (!isPlaying) return;
    
    const now = performance.now();
    const deltaTime = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    
    // Protection contre les grands intervalles
    const safeDeltaTime = Math.min(deltaTime, 0.05);
    
    // Mise à jour de la position
    const positionChange = safeDeltaTime * playbackRate * playDirection;
    playbackPosition += positionChange;
    
    // === GESTION DE LA LECTURE EN BOUCLE ===
    if (loopPlayback) {
        // Gérer les limites en mode boucle
        if (playbackPosition < 0) {
            // Boucle: début → fin (en lecture arrière)
            const overshoot = -playbackPosition;
            playbackPosition = audioBuffer.duration - overshoot;
            console.log("[Audio] Boucle: passage du début à la fin");
        } 
        else if (playbackPosition > audioBuffer.duration) {
            // Boucle: fin → début (en lecture avant)
            const overshoot = playbackPosition - audioBuffer.duration;
            playbackPosition = overshoot;
            console.log("[Audio] Boucle: passage de la fin au début");
        }
    } 
    else {
        // Mode sans boucle: arrêter aux limites
        if (playbackPosition < 0) {
            playbackPosition = 0;
            console.log("[Audio] Début du morceau atteint");
        } else if (playbackPosition > audioBuffer.duration) {
            playbackPosition = audioBuffer.duration;
            console.log("[Audio] Fin du morceau atteinte");
        }
    }
    
    // Mettre à jour le filtre
    updateFilter();
    
    // Planifier le grain si nécessaire
    if (!pendingGrainFlag) {
        scheduleGrain();
        pendingGrainFlag = true;
        
        // Réinitialiser le drapeau après un délai pour le prochain grain
        const grainInterval = GRAIN_SIZE * (1 - OVERLAP) / Math.max(0.1, Math.abs(playbackRate));
        setTimeout(() => {
            pendingGrainFlag = false;
        }, grainInterval * 1000);
    }
    
    // Mettre à jour l'affichage
    updatePlaybackDisplay();
    
    // Continuer la boucle
    audioFrameId = setTimeout(scheduleAudioUpdate, UPDATE_INTERVAL);
}

// Fonction d'aide pour mettre à jour l'état du bouton play/pause
function updatePlayPauseButton(playing) {
    const playPauseButton = document.getElementById('playPauseButton');
    if (!playPauseButton) return;
    
    const playIcon = playPauseButton.querySelector('.play-icon');
    const pauseIcon = playPauseButton.querySelector('.pause-icon');
    
    if (playIcon && pauseIcon) {
        if (playing) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }
}

// Démarrer la lecture avec bouton unique play/pause
function startAudio() {
    if (!audioBuffer || isPlaying) return;
    
    // Réveiller le contexte audio si nécessaire
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // Réinitialiser l'état
    isPlaying = true;
    lastFrameTime = performance.now();
    audioSources = [];
    pendingGrainFlag = false;
    isLoopTransitioning = false;
    
    // Démarrer la boucle
    if (audioFrameId) {
        clearTimeout(audioFrameId);
    }
    scheduleAudioUpdate();
    
    // Mettre à jour l'état
    const statusDisplay = document.getElementById('audioStatus');
    if (statusDisplay) {
        statusDisplay.textContent = 'État: Lecture';
        statusDisplay.style.color = '#2ecc71';
    }
    
    // Mettre à jour l'icône du bouton play/pause
    updatePlayPauseButton(true);
    
    console.log(`[Audio] Lecture démarrée à la position ${playbackPosition.toFixed(2)}s`);
}

// Mettre en pause la lecture
function pauseAudio() {
    if (!isPlaying) return;
    
    isPlaying = false;
    
    // Arrêter la boucle
    if (audioFrameId) {
        clearTimeout(audioFrameId);
        audioFrameId = null;
    }
    
    // Arrêter les sources actives
    stopAllSources();
    
    // Mettre à jour l'état
    const statusDisplay = document.getElementById('audioStatus');
    if (statusDisplay) {
        statusDisplay.textContent = 'État: Pause';
        statusDisplay.style.color = '#f39c12';
    }
    
    // Mettre à jour l'icône du bouton play/pause
    updatePlayPauseButton(false);
    
    console.log(`[Audio] Lecture mise en pause à la position ${playbackPosition.toFixed(2)}s`);
}

// Arrêter la lecture
function stopAudio() {
    if (!audioBuffer) return;
    
    isPlaying = false;
    
    // Arrêter la boucle
    if (audioFrameId) {
        clearTimeout(audioFrameId);
        audioFrameId = null;
    }
    
    // Arrêter les sources actives
    stopAllSources();
    
    // Réinitialiser la position
    playbackPosition = 0;
    
    // Mettre à jour l'état
    const statusDisplay = document.getElementById('audioStatus');
    if (statusDisplay) {
        statusDisplay.textContent = 'État: Arrêté';
        statusDisplay.style.color = '#666';
    }
    
    // Mettre à jour l'icône du bouton play/pause
    updatePlayPauseButton(false);
    
    console.log('[Audio] Lecture arrêtée');
}

// Arrêter toutes les sources audio actives
function stopAllSources() {
    const now = audioContext.currentTime;
    audioSources.forEach(source => {
        try {
            // Fondu de sortie rapide
            if (source.gainNode) {
                source.gainNode.gain.cancelScheduledValues(now);
                source.gainNode.gain.setValueAtTime(source.gainNode.gain.value || 0, now);
                source.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
            }
            
            // Arrêter après le fondu
            setTimeout(() => {
                try {
                    source.stop();
                    if (source.gainNode) source.gainNode.disconnect();
                    source.disconnect();
                } catch (e) {
                    // Ignorer les erreurs
                }
            }, 60);
        } catch (e) {
            // Ignorer les erreurs
        }
    });
    
    // Vider la file après le fondu
    setTimeout(() => {
        audioSources = [];
    }, 100);
}

// Mettre à jour l'affichage de la lecture
function updatePlaybackDisplay() {
    if (!audioBuffer) return;
    
    // Position
    const positionDisplay = document.getElementById('positionDisplay');
    if (positionDisplay) {
        const position = (playbackPosition / audioBuffer.duration) * 100;
        const formattedTime = formatTime(playbackPosition);
        const totalTime = formatTime(audioBuffer.duration);
        positionDisplay.textContent = `${formattedTime} / ${totalTime}`;
    }
    
    // Timeline
    const timelineProgress = document.getElementById('timelineProgress');
    if (timelineProgress) {
        const position = (playbackPosition / audioBuffer.duration) * 100;
        timelineProgress.style.width = `${position}%`;
    }
    
    // Timeline handle
    const timelineHandle = document.getElementById('timelineHandle');
    if (timelineHandle) {
        const position = (playbackPosition / audioBuffer.duration) * 100;
        timelineHandle.style.left = `${position}%`;
    }
    
    // Vitesse
    const speedDisplay = document.getElementById('speedDisplay');
    if (speedDisplay) {
        const directionText = playDirection > 0 ? "avant" : "arrière";
        speedDisplay.textContent = `Vitesse: ${Math.abs(playbackRate).toFixed(2)}x (${directionText})`;
    }
    
    // Volume
    const volumeDisplay = document.getElementById('volumeDisplay');
    if (volumeDisplay) {
        volumeDisplay.textContent = `Volume: ${Math.round(currentVolume * 100)}%`;
    }
}

// Formatage du temps (secondes -> MM:SS)
function formatTime(timeInSeconds) {
    if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Contrôle audio avec les capteurs (avec facteur de sensibilité)
function updateAudioControls(deltaTime) {
    // Vérifier les prérequis
    if (!audioBuffer) return;
    
    // CAPTEUR DROIT (Y/Pitch) - contrôle du volume
    const volumeValue = angleToNormalizedValue(currentValues.rightY);
    const volumePercentage = 50 + (volumeValue * 50 * SENSITIVITY_FACTOR); // Application du facteur de sensibilité
    const volumeFinal = Math.min(100, Math.max(0, volumePercentage));
    
    // Appliquer le volume avec un léger lissage
    currentVolume = lerp(currentVolume, volumeFinal / 100, 0.1);
    
    // Mise à jour de l'affichage du volume
    const volumeDisplay = document.getElementById('volumeDisplay');
    if (volumeDisplay) {
        volumeDisplay.textContent = `Volume: ${Math.round(currentVolume * 100)}%`;
    }
    
    // CAPTEUR GAUCHE (Y/Pitch) - contrôle de la vitesse et direction
    const speedValue = angleToNormalizedValue(currentValues.leftY);
    
    // Calculer la vitesse et la direction avec sensibilité ajustée
    let newSpeed = 0;
    let newDirection = 1;
    
    if (speedValue >= 0) {
        // Vitesse positive (avant)
        newSpeed = 1.0 + (speedValue * SENSITIVITY_FACTOR);
        newDirection = 1;
    } else {
        // Vitesse négative (arrière)
        newSpeed = Math.abs(speedValue * 2 * SENSITIVITY_FACTOR);
        newDirection = -1;
    }
    
    // Vitesse minimale pour éviter la pause (CORRECTION)
    const MIN_SPEED = 0.2; // Vitesse minimale pour éviter la pause complète
    if (newSpeed < MIN_SPEED) {
        newSpeed = MIN_SPEED;
    }
    
    // Arrondir pour éviter les micro-variations
    newSpeed = Math.round(newSpeed * 100) / 100;
    
    // Si changement significatif de vitesse ou de direction
    if (Math.abs(newSpeed - playbackRate) > 0.05 || newDirection !== playDirection) {
        // Mise à jour de la vitesse et de la direction
        playbackRate = newSpeed;
        playDirection = newDirection;
        
        // Si pas déjà en lecture, démarrer ou reprendre la lecture
        const wasPlaying = isPlaying;
        if (!isPlaying) {
            startAudio();
        }
        
        // Synchronisation de l'UI si l'état a changé
        if (!wasPlaying && isPlaying) {
            updatePlayPauseButton(true);
        }
        
        // Mise à jour de l'affichage de la vitesse
        const speedDisplay = document.getElementById('speedDisplay');
        if (speedDisplay) {
            const directionText = playDirection > 0 ? "avant" : "arrière";
            speedDisplay.textContent = `Vitesse: ${Math.abs(playbackRate).toFixed(2)}x (${directionText})`;
        }
    }
}

// Fonction pour tester le système de dialogue
function testDialogueSystem() {
    dialogueSystem.addDialogue("Handy", "Je me demande si je peux réparer ce dispositif audio...");
    dialogueSystem.addDialogue("Echo", "Ces contrôles ressemblent à ceux que ton père utilisait.");
    dialogueSystem.addDialogue("Handy", "Tu as raison! Les mouvements semblent déclencher des changements dans la musique.");
}

// Initialiser l'audio et l'interface lorsque la page est chargée
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Initialisation audio
        initAudio();
        
        // Configuration de l'interface améliorée
        // Onglets
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
        
        // Slider de sensibilité
        const sensitivitySlider = document.getElementById('sensitivitySlider');
        const sensitivityValue = document.getElementById('sensitivityValue');
        
        if (sensitivitySlider && sensitivityValue) {
            sensitivitySlider.addEventListener('input', function() {
                SENSITIVITY_FACTOR = parseFloat(this.value);
                sensitivityValue.textContent = SENSITIVITY_FACTOR.toFixed(1);
                console.log('[Capteurs] Sensibilité modifiée:', SENSITIVITY_FACTOR);
            });
        }
        
        // Paramètres audio avancés
        const grainSizeInput = document.getElementById('grainSizeInput');
        const overlapInput = document.getElementById('overlapInput');
        const windowTypeSelect = document.getElementById('windowTypeSelect');
        
        if (grainSizeInput) {
            grainSizeInput.value = GRAIN_SIZE * 1000;
            grainSizeInput.addEventListener('change', function() {
                GRAIN_SIZE = parseInt(this.value) / 1000;
                console.log('[Audio] Taille de grain modifiée:', GRAIN_SIZE);
            });
        }
        
        if (overlapInput) {
            overlapInput.value = OVERLAP * 100;
            overlapInput.addEventListener('change', function() {
                OVERLAP = parseInt(this.value) / 100;
                console.log('[Audio] Chevauchement modifié:', OVERLAP);
            });
        }
        
        if (windowTypeSelect) {
            windowTypeSelect.value = WINDOW_TYPE;
            windowTypeSelect.addEventListener('change', function() {
                WINDOW_TYPE = this.value;
                console.log('[Audio] Type de fenêtre modifié:', WINDOW_TYPE);
            });
        }
        
        // Ajout des paramètres de capteurs dans l'onglet Sound Control
        const soundControlTab = document.getElementById('soundTab');
        if (soundControlTab) {
            // Vérifie si la section de paramètres existe déjà, sinon la crée
            let sensorParamsSection = soundControlTab.querySelector('.sensor-params-section');
            
            if (!sensorParamsSection) {
                sensorParamsSection = document.createElement('div');
                sensorParamsSection.className = 'sensor-params-section settings-section';
                
                // Ajouter un titre pour cette section
                const sectionTitle = document.createElement('h3');
                sectionTitle.textContent = 'Paramètres des capteurs';
                sensorParamsSection.appendChild(sectionTitle);
                
                // Conteneur pour les paramètres
                const paramsContainer = document.createElement('div');
                paramsContainer.className = 'params-container';
                
                // 1. Adresses des capteurs
                const leftSensorIdContainer = document.createElement('div');
                leftSensorIdContainer.className = 'setting-item';
                leftSensorIdContainer.innerHTML = `
                    <label for="customLeftSensorId">Adresse capteur gauche:</label>
                    <input type="text" id="customLeftSensorId" value="${SENSOR_LEFT}">
                `;
                paramsContainer.appendChild(leftSensorIdContainer);
                
                const rightSensorIdContainer = document.createElement('div');
                rightSensorIdContainer.className = 'setting-item';
                rightSensorIdContainer.innerHTML = `
                    <label for="customRightSensorId">Adresse capteur droit:</label>
                    <input type="text" id="customRightSensorId" value="${SENSOR_RIGHT}">
                `;
                paramsContainer.appendChild(rightSensorIdContainer);
                
                // 2. Inversion main droite/gauche
                const swapHandsContainer = document.createElement('div');
                swapHandsContainer.className = 'setting-item';
                swapHandsContainer.innerHTML = `
                    <label for="swapHands">Inverser main droite et gauche:</label>
                    <input type="checkbox" id="swapHands">
                `;
                paramsContainer.appendChild(swapHandsContainer);
                
                // Bouton d'application des changements
                const applyButton = document.createElement('button');
                applyButton.textContent = 'Appliquer les changements';
                applyButton.className = 'apply-button';
                applyButton.style.backgroundColor = '#4CAF50';
                applyButton.style.color = 'white';
                applyButton.style.border = 'none';
                applyButton.style.padding = '8px 16px';
                applyButton.style.marginTop = '15px';
                applyButton.style.borderRadius = '4px';
                applyButton.style.cursor = 'pointer';
                
                // Ajout des gestionnaires d'événements
                applyButton.addEventListener('click', function() {
                    const newLeftId = document.getElementById('customLeftSensorId').value.trim();
                    const newRightId = document.getElementById('customRightSensorId').value.trim();
                    const swapHands = document.getElementById('swapHands').checked;
                    
                    if (newLeftId && newRightId) {
                        // Sauvegarder les anciennes valeurs pour la comparaison
                        const oldLeftId = SENSOR_LEFT;
                        const oldRightId = SENSOR_RIGHT;
                        
                        // Appliquer les modifications selon l'état de swapHands
                        if (swapHands) {
                            SENSOR_LEFT = newRightId;
                            SENSOR_RIGHT = newLeftId;
                            console.log('[Capteurs] Inversion des mains: gauche ↔ droite');
                        } else {
                            SENSOR_LEFT = newLeftId;
                            SENSOR_RIGHT = newRightId;
                        }
                        
                        console.log(`[Capteurs] ID capteur gauche modifié: ${SENSOR_LEFT}`);
                        console.log(`[Capteurs] ID capteur droit modifié: ${SENSOR_RIGHT}`);
                        
                        // Afficher confirmation
                        alert('Paramètres des capteurs mis à jour. Redémarrez le scan pour appliquer les changements.');
                        
                        // Si les IDs ont changé, suggérer un nouveau scan
                        if (oldLeftId !== SENSOR_LEFT || oldRightId !== SENSOR_RIGHT) {
                            // Réinitialiser les capteurs connectés
                            connectedDevices.clear();
                            sensorsWithData.clear();
                            
                            // Mettre à jour l'interface pour refléter le changement
                            if (deviceList) {
                                deviceList.innerHTML = '';
                                deviceList.appendChild(createDeviceDisplay('GAUCHE', LEFT_COLOR, SENSOR_LEFT));
                                deviceList.appendChild(createDeviceDisplay('DROIT', RIGHT_COLOR, SENSOR_RIGHT));
                            }
                            
                            // Activer le bouton de scan
                            enableScanButton("Rechercher les capteurs", "#4CAF50", true);
                        }
                    } else {
                        alert('Veuillez entrer des adresses valides pour les deux capteurs.');
                    }
                });
                
                paramsContainer.appendChild(applyButton);
                sensorParamsSection.appendChild(paramsContainer);
                
                // Ajouter la section au bas de l'onglet Sound Control
                soundControlTab.appendChild(sensorParamsSection);
            }
        }
        
        // Espace narratif - Ajout de l'image de Rita avec méthodes alternatives
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            // Créer un conteneur pour l'image et le dialogue
            const characterContainer = document.createElement('div');
            characterContainer.className = 'character-container';
            
            // Ajouter l'image du personnage avec plusieurs tentatives de chemins
            const characterImg = document.createElement('img');
            // Essayer plusieurs chemins possibles
            const possiblePaths = [
                './assets/placeholder-character.png',
                '../assets/placeholder-character.png',
                'assets/placeholder-character.png',
                '/assets/placeholder-character.png'
            ];
            
            let imgLoaded = false;
            
            function tryNextPath(index) {
                if (index >= possiblePaths.length) {
                    console.error('[Narratif] Impossible de charger l\'image de Rita avec tous les chemins essayés');
                    // Créer un élément visuel de remplacement
                    const placeholderDiv = document.createElement('div');
                    placeholderDiv.style.width = '200px';
                    placeholderDiv.style.height = '300px';
                    placeholderDiv.style.backgroundColor = '#ddd';
                    placeholderDiv.style.display = 'flex';
                    placeholderDiv.style.justifyContent = 'center';
                    placeholderDiv.style.alignItems = 'center';
                    placeholderDiv.style.borderRadius = '8px';
                    placeholderDiv.textContent = 'Image Rita';
                    characterContainer.appendChild(placeholderDiv);
                    return;
                }
                
                characterImg.src = possiblePaths[index];
                console.log(`[Narratif] Tentative de chargement de l'image: ${possiblePaths[index]}`);
                
                characterImg.onload = () => {
                    console.log(`[Narratif] Image de Rita chargée avec succès depuis: ${possiblePaths[index]}`);
                    imgLoaded = true;
                };
                
                characterImg.onerror = () => {
                    console.warn(`[Narratif] Échec du chargement depuis: ${possiblePaths[index]}`);
                    tryNextPath(index + 1);
                };
            }
            
            // Démarrer la tentative de chargement
            characterImg.alt = 'Rita';
            characterImg.className = 'character-image';
            tryNextPath(0);
            
            // Ajouter l'image au conteneur
            characterContainer.appendChild(characterImg);
            
            // Ajouter une boîte de dialogue par défaut
            const dialogBox = document.createElement('div');
            dialogBox.className = 'dialog-box';
            dialogBox.innerHTML = '<p>Bienvenue dans Heart Of Glass, l\'aventure de Rita!</p>';
            characterContainer.appendChild(dialogBox);
            
            // Ajouter le tout au contenu principal
            mainContent.appendChild(characterContainer);
            
            // Afficher aussi le chemin de l'image
            console.log('[Narratif] Chemin absolu du répertoire de travail:', window.location.href);
        }
        
        // Espace narratif - interaction
        const narrativeSpace = document.querySelector('.narrative-space');
        if (narrativeSpace) {
            narrativeSpace.addEventListener('click', function() {
                if (dialogueSystem.isActive) {
                    dialogueSystem.speedUpText();
                } else {
                    // Pour tester le dialogue si aucun n'est actif
                    testDialogueSystem();
                }
            });
        }
        
        // Interaction avec la timeline
        const timelineContainer = document.getElementById('timelineContainer');
        if (timelineContainer) {
            timelineContainer.addEventListener('click', function(e) {
                if (!audioBuffer) return;
                
                const rect = this.getBoundingClientRect();
                const position = (e.clientX - rect.left) / rect.width;
                playbackPosition = position * audioBuffer.duration;
                
                updatePlaybackDisplay();
                console.log(`[Audio] Position changée manuellement: ${playbackPosition.toFixed(2)}s`);
            });
        }
        
        // Loopback checkbox
        const loopCheckbox = document.getElementById('loopCheckbox');
        if (loopCheckbox) {
            loopCheckbox.checked = loopPlayback;
            loopCheckbox.addEventListener('change', function() {
                loopPlayback = this.checked;
                console.log(`[Audio] Lecture en boucle ${loopPlayback ? 'activée' : 'désactivée'}`);
            });
        }
        
        // Gestionnaire d'événement pour le bouton play/pause
        const playPauseButton = document.getElementById('playPauseButton');
        if (playPauseButton) {
            playPauseButton.addEventListener('click', function() {
                if (!audioBuffer) {
                    alert('Veuillez sélectionner un fichier audio');
                    return;
                }
                
                if (isPlaying) {
                    pauseAudio();
                } else {
                    startAudio();
                }
            });
        }
        
        // Bouton d'enregistrement
        const recordButton = document.getElementById('recordButton');
        if (recordButton) {
            recordButton.addEventListener('click', toggleRecording);
            recordButton.disabled = !audioBuffer;
        }
        
        // Nettoyer si nécessaire
        window.addEventListener('beforeunload', () => {
            stopAnimationLoop();
            stopAudio();
        });
        
        console.log('[Initialisation] Interface et audio initialisés avec succès');
    } catch (e) {
        console.error('[Démarrage] Erreur initialisation:', e);
    }
});