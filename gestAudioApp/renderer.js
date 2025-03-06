const noble = require('@abandonware/noble')

// Variables globales pour les capteurs et l'interface
let isScanning = false
const scanButton = document.getElementById('scanButton')
const deviceList = document.getElementById('deviceList')
const connectedDevices = new Set()
const sensorsWithData = new Set() // Pour suivre les capteurs qui affichent des données

const SENSOR_LEFT = 'ce:de:c2:f5:17:be'
const SENSOR_RIGHT = 'f0:70:c4:de:d1:22'
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

// Paramètres améliorés pour une expérience type vinyle/bande
const GRAIN_SIZE = 0.35;          // Grains plus longs pour réduire l'effet métallique (350ms)
const OVERLAP = 0.92;             // Chevauchement extrême pour éliminer les craquements (92%)
const UPDATE_RATE = 90;           // Taux de mise à jour très élevé pour une meilleure précision
const UPDATE_INTERVAL = 1000 / UPDATE_RATE;
const MAX_ACTIVE_GRAINS = 12;     // Plus de grains simultanés pour une couverture complète
const WINDOW_TYPE = 'hann';       // Options: 'hann', 'blackman', 'triangular', 'gaussian'
const PITCH_SHIFT_MODE = true;    // Utiliser le pitch shifting pour vitesses extrêmes
const MAX_RATE_BEFORE_PITCHSHIFT = 2.5; // Seuil au-delà duquel activer le pitch shift

// Chaîne de traitement audio et filtres
let filterNode = null
let analyserNode = null
let processingChain = null
let pendingGrainQueue = []
let lastReportedPosition = 0

// Système de protection
let underrunProtection = 0.25;    // Protection contre le sous-échantillonnage (250ms)
let isPositionLooping = false;    // Détection de boucle
let lastPositionUpdate = 0;       // Temps de la dernière mise à jour de position

// File d'attente pour les sources audio
let audioSources = []

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
        
        // Vérifier l'état des capteurs (nouveau)
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
    
    // Log pour déboguer
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
    const color = peripheral.address.toLowerCase() === SENSOR_LEFT ? LEFT_COLOR : RIGHT_COLOR
    
    const infoBasic = deviceDiv.querySelector('.info-basic')
    if (!infoBasic) {
        console.error('[UI] updateDeviceInfo: .info-basic non trouvé')
        return
    }

    // Préserver la valeur de batterie si c'est le capteur gauche
    let batteryText = 'Batterie: --%'
    if (peripheral.address.toLowerCase() === SENSOR_LEFT) {
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
            const color = address.toLowerCase() === SENSOR_LEFT ? LEFT_COLOR : RIGHT_COLOR
            batteryText.style.color = color
            batteryText.textContent = `Batterie: ${percentage}%`
        } else {
            console.error('[Batterie] Élément batterie non trouvé dans le DOM')
        }
    }
}

function getSensorInfo(address) {
    const addrLower = address.toLowerCase()
    if (addrLower === SENSOR_LEFT) return { position: 'GAUCHE', color: LEFT_COLOR }
    if (addrLower === SENSOR_RIGHT) return { position: 'DROIT', color: RIGHT_COLOR }
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
    if (address.toLowerCase() === SENSOR_LEFT) {
        targetValues.leftX = normalizedAngles.x
        targetValues.leftY = normalizedAngles.y
        targetValues.leftZ = normalizedAngles.z
    } else if (address.toLowerCase() === SENSOR_RIGHT) {
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
    
    // Vérifier l'état des capteurs après chaque mise à jour (nouveau)
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
        const color = peripheral.address.toLowerCase() === SENSOR_LEFT ? LEFT_COLOR : RIGHT_COLOR
        
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
                    if (peripheral.address.toLowerCase() === SENSOR_LEFT && characteristics.length > 0) {
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
                                    if (data[1] === 0x71 && peripheral.address.toLowerCase() === SENSOR_LEFT) {
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

// --- SYSTÈME AUDIO AMÉLIORÉ MODE VINYLE ---

// Créer une fenêtre d'apodisation pour éliminer les artefacts
function createWindow(type, length) {
    const window = new Float32Array(length);
    const factor = 2 * Math.PI / (length - 1);
    
    switch (type) {
        case 'hann': // Fenêtre de Hann (excellente pour l'audio)
            for (let i = 0; i < length; i++) {
                window[i] = 0.5 * (1 - Math.cos(i * factor));
            }
            break;
        
        case 'blackman': // Fenêtre de Blackman (encore meilleures basses)
            const alpha = 0.16;
            const a0 = (1 - alpha) / 2;
            const a1 = 0.5;
            const a2 = alpha / 2;
            
            for (let i = 0; i < length; i++) {
                const x = i / (length - 1);
                window[i] = a0 - a1 * Math.cos(2 * Math.PI * x) + a2 * Math.cos(4 * Math.PI * x);
            }
            break;
            
        case 'triangular': // Fenêtre triangulaire (simple mais efficace)
            const halfLength = (length - 1) / 2;
            for (let i = 0; i < length; i++) {
                window[i] = 1 - Math.abs((i - halfLength) / halfLength);
            }
            break;
            
        case 'gaussian': // Fenêtre gaussienne (très douce)
            const sigma = 0.4;
            const center = (length - 1) / 2;
            for (let i = 0; i < length; i++) {
                const x = (i - center) / center;
                window[i] = Math.exp(-0.5 * Math.pow(x / sigma, 2));
            }
            break;
            
        default: // Rectangle avec bords adoucis (simple)
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

// Créer un graphe de traitement audio complet
function createAdvancedAudioProcessingGraph() {
    if (!audioContext) return null;
    
    try {
        // Créer une chaîne de filtrage sophistiquée
        
        // 1. Filtre passe-bas principal (pour simuler le comportement d'une tête de lecture réelle)
        const lowpassFilter = audioContext.createBiquadFilter();
        lowpassFilter.type = 'lowpass';
        lowpassFilter.frequency.value = 20000;
        lowpassFilter.Q.value = 0.7;
        
        // 2. Filtre passe-haut pour éliminer les bruits de très basse fréquence
        const highpassFilter = audioContext.createBiquadFilter();
        highpassFilter.type = 'highpass';
        highpassFilter.frequency.value = 20; // Couper sous 20Hz
        highpassFilter.Q.value = 0.7;
        
        // 3. Égaliseur paramétrique pour adoucir les moyennes fréquences
        const midEQ = audioContext.createBiquadFilter();
        midEQ.type = 'peaking';
        midEQ.frequency.value = 1000; // 1kHz
        midEQ.Q.value = 1.0;
        midEQ.gain.value = -1.0; // Légère réduction pour adoucir
        
        // 4. Compresseur pour contrôler les pics
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.050;
        
        // 5. Analyseur pour le diagnostic
        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 2048;
        analyzer.smoothingTimeConstant = 0.8;
        
        // Connecter les éléments ensemble
        lowpassFilter.connect(highpassFilter);
        highpassFilter.connect(midEQ);
        midEQ.connect(compressor);
        compressor.connect(analyzer);
        analyzer.connect(audioContext.destination);
        
        // Stocker les références
        filterNode = lowpassFilter;
        analyserNode = analyzer;
        
        // Chaîne de traitement
        processingChain = {
            lowpass: lowpassFilter,
            highpass: highpassFilter,
            equalizer: midEQ,
            compressor: compressor,
            analyzer: analyzer
        };
        
        console.log('[Audio] Graphe de traitement audio avancé créé');
        
        return processingChain;
    } catch (e) {
        console.error('[Audio] Erreur lors de la création du graphe audio avancé:', e);
        // Fallback au graphe simple
        try {
            filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = 18000;
            
            analyserNode = audioContext.createAnalyser();
            
            filterNode.connect(analyserNode);
            analyserNode.connect(audioContext.destination);
            
            return { lowpass: filterNode, analyzer: analyserNode };
        } catch (fallbackError) {
            console.error('[Audio] Échec du fallback:', fallbackError);
            return null;
        }
    }
}

// Adapter le filtre de manière plus naturelle selon la vitesse
function updateAdvancedFilter(rate, direction) {
    if (!processingChain) return;
    
    try {
        const absRate = Math.abs(rate);
        
        // 1. Filtre passe-bas: vitesses élevées = moins de hautes fréquences
        let cutoffFreq = 20000;
        if (absRate > 1.5) {
            // Réduction progressive des hautes fréquences avec la vitesse
            cutoffFreq = 20000 - ((absRate - 1.5) * 4000);
            cutoffFreq = Math.max(8000, cutoffFreq); // Ne jamais descendre sous 8kHz
        }
        processingChain.lowpass.frequency.setTargetAtTime(cutoffFreq, audioContext.currentTime, 0.1);
        
        // 2. Ajuster la résonance selon la direction
        const newQ = direction < 0 ? 0.9 : 0.7; // Légèrement plus de résonance en arrière
        processingChain.lowpass.Q.setTargetAtTime(newQ, audioContext.currentTime, 0.2);
        
        // 3. Ajuster l'égalisation selon la vitesse
        if (absRate > 2.0) {
            // Réduire davantage les moyennes à haute vitesse pour atténuer l'effet métallique
            processingChain.equalizer.gain.setTargetAtTime(-2.5, audioContext.currentTime, 0.2);
            // Ajuster la fréquence ciblée
            processingChain.equalizer.frequency.setTargetAtTime(1500, audioContext.currentTime, 0.2);
        } else {
            // Égalisation plus neutre à vitesse normale
            processingChain.equalizer.gain.setTargetAtTime(-1.0, audioContext.currentTime, 0.2);
            processingChain.equalizer.frequency.setTargetAtTime(1000, audioContext.currentTime, 0.2);
        }
        
        // 4. Ajuster le compresseur selon la vitesse
        if (absRate > 2.5) {
            // Compression plus agressive à très haute vitesse
            processingChain.compressor.threshold.setTargetAtTime(-28, audioContext.currentTime, 0.2);
            processingChain.compressor.ratio.setTargetAtTime(5, audioContext.currentTime, 0.2);
        } else {
            // Compression plus légère à vitesse normale
            processingChain.compressor.threshold.setTargetAtTime(-24, audioContext.currentTime, 0.2);
            processingChain.compressor.ratio.setTargetAtTime(4, audioContext.currentTime, 0.2);
        }
        
    } catch (e) {
        console.error('[Audio] Erreur lors de la mise à jour du filtre avancé:', e);
    }
}

// Initialisation du système audio
function initAudio() {
    try {
        // Créer l'élément audio standard (pour compatibilité)
        audioElement = document.createElement('audio');
        document.body.appendChild(audioElement);
        
        // Créer le contexte audio
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[Audio] Contexte audio créé');
        
        // Créer le graphe de traitement audio avancé
        processingChain = createAdvancedAudioProcessingGraph();
        
        // Interface utilisateur pour l'état de lecture
        const controlsContainer = document.getElementById('audioControls');
        if (controlsContainer) {
            // État de lecture
            const statusDisplay = document.createElement('div');
            statusDisplay.id = 'audioStatus';
            statusDisplay.style.fontWeight = 'bold';
            statusDisplay.style.marginTop = '10px';
            statusDisplay.textContent = 'État: Prêt';
            controlsContainer.appendChild(statusDisplay);
            
            // Bouton de diagnostic audio
            const debugButton = document.createElement('button');
            debugButton.textContent = 'Diagnostiquer Audio';
            debugButton.style.marginTop = '10px';
            debugButton.addEventListener('click', () => {
                debugAudioState();
            });
            controlsContainer.appendChild(debugButton);
        }
    } catch (e) {
        console.error('[Audio] Erreur création contexte audio:', e);
    }
    
    try {
        // Sélection du fichier
        const fileInput = document.getElementById('audioFile');
        const playButton = document.getElementById('playButton');
        const pauseButton = document.getElementById('pauseButton');
        const stopButton = document.getElementById('stopButton');
        
        // Gestion du chargement de fichier
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
                    const arrayBuffer = event.target.result;
                    
                    try {
                        // Décoder les données audio
                        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        playbackPosition = 0;
                        
                        // Mettre à jour l'interface
                        updatePlaybackDisplay();
                        console.log(`[Audio] Fichier chargé et décodé: ${file.name}`);
                    } catch (decodeError) {
                        console.error('[Audio] Erreur lors du décodage:', decodeError);
                    }
                };
                
                reader.onerror = function(event) {
                    console.error('[Audio] Erreur lecture fichier:', event);
                };
                
                reader.readAsArrayBuffer(file);
            } catch (error) {
                console.error('[Audio] Erreur lors du chargement:', error);
            }
        });
        
        // Bouton lecture
        if (playButton) {
            playButton.addEventListener('click', function() {
                if (!audioBuffer) {
                    alert('Veuillez sélectionner un fichier audio');
                    return;
                }
                startAudio();
            });
        }
        
        // Bouton pause
        if (pauseButton) {
            pauseButton.addEventListener('click', function() {
                pauseAudio();
            });
        }
        
        // Bouton stop
        if (stopButton) {
            stopButton.addEventListener('click', function() {
                stopAudio();
                playbackPosition = 0;
                updatePlaybackDisplay();
            });
        }
        
    } catch (initError) {
        console.error('[Audio] Erreur initialisation audio:', initError);
    }
}

// Nettoyer les sources terminées
function cleanupEndedSources() {
    const now = audioContext.currentTime;
    const initialCount = audioSources.length;
    
    audioSources = audioSources.filter(source => {
        if (source.endTime < now) {
            try {
                // S'assurer que la source et le gain sont bien déconnectés
                if (source.gainNode) {
                    source.gainNode.disconnect();
                }
                source.disconnect();
            } catch (e) {
                // Ignorer les erreurs, la source peut déjà être déconnectée
            }
            return false; // Supprimer de la file
        }
        return true; // Garder dans la file
    });
    
    // Si beaucoup de sources ont été nettoyées, on le note
    if (initialCount - audioSources.length > 3) {
        console.log(`[Audio] Nettoyage: ${initialCount - audioSources.length} sources terminées`);
    }
}

// Planifier le prochain grain audio avec émulation vinyle améliorée
function scheduleGrain() {
    if (!isPlaying || !audioBuffer) return false;
    
    try {
        // Nettoyer les sources terminées
        cleanupEndedSources();
        
        // Si trop de grains actifs, limiter
        if (audioSources.length >= MAX_ACTIVE_GRAINS) {
            return false;
        }
        
        // Protéger contre les boucles de position (détection de répétition)
        const now = performance.now();
        if (now - lastPositionUpdate > 50 && Math.abs(playbackPosition - lastReportedPosition) < 0.001) {
            if (!isPositionLooping) {
                console.warn('[Audio] Détection de boucle possible, position stable à', playbackPosition.toFixed(3));
                isPositionLooping = true;
            }
            
            // Stratégie anti-bouclage: ajuster légèrement la position
            if (playDirection < 0 && playbackPosition < 0.1) {
                playbackPosition = 0;
                return false;
            } else if (playDirection > 0 && playbackPosition > audioBuffer.duration - 0.1) {
                playbackPosition = audioBuffer.duration;
                return false;
            }
        } else {
            isPositionLooping = false;
            lastReportedPosition = playbackPosition;
            lastPositionUpdate = now;
        }
        
        // Déterminer les paramètres du grain
        const absRate = Math.abs(playbackRate);
        
        // Adapter la taille du grain en fonction de la vitesse
        let grainSize = GRAIN_SIZE;
        if (absRate > 1.5) {
            // Réduire la taille des grains à haute vitesse pour plus de précision
            grainSize = GRAIN_SIZE / (1 + (absRate - 1.5) * 0.2);
            grainSize = Math.max(0.15, grainSize); // Ne pas descendre sous 150ms
        }
        
        // Ajouter une légère variation aléatoire de taille pour éviter la périodicité audible
        const sizeVariation = grainSize * 0.025; // 2.5% de variation maximale
        const finalGrainSize = grainSize + (Math.random() * 2 - 1) * sizeVariation;
        
        // Calculer la position du grain
        let grainPosition = playbackPosition;
        
        // En lecture arrière rapide, ajouter une protection pour éviter la répétition
        if (playDirection < 0 && absRate > 2.0) {
            // La protection augmente avec la vitesse
            const backShift = underrunProtection * (1 + (absRate - 2.0) * 0.5);
            grainPosition = Math.max(0, grainPosition - backShift * finalGrainSize);
        }
        
        // Vérifier les limites
        if (grainPosition < 0) {
            return false; // Ne pas créer de grain avant le début
        } else if (grainPosition >= audioBuffer.duration) {
            return false; // Ne pas créer de grain après la fin
        }
        
        // Déterminer la durée disponible
        let availableDuration = finalGrainSize;
        if (grainPosition + availableDuration > audioBuffer.duration) {
            availableDuration = audioBuffer.duration - grainPosition;
        }
        
        if (availableDuration < 0.05) {
            return false; // Éviter les grains trop courts
        }
        
        // Créer une nouvelle source
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Déterminer le taux de lecture et le mode (pitch shift ou non)
        let playRate = absRate;
        let isPitchShifted = false;
        
        if (PITCH_SHIFT_MODE && absRate > MAX_RATE_BEFORE_PITCHSHIFT) {
            // Mode de pitch shift: lecture à vitesse réduite + ajustement de position
            playRate = MAX_RATE_BEFORE_PITCHSHIFT;
            isPitchShifted = true;
        }
        
        source.playbackRate.value = playRate;
        
        // Créer un nœud de gain avec courbe avancée
        const gainNode = audioContext.createGain();
        
        // Connecter la source au gain
        source.connect(gainNode);
        
        // Connecter le gain à la chaîne de traitement
        if (processingChain && processingChain.lowpass) {
            gainNode.connect(processingChain.lowpass);
        } else if (filterNode) {
            gainNode.connect(filterNode);
        } else {
            gainNode.connect(audioContext.destination);
        }
        
        // Calculer les timings précis
        const currentTime = audioContext.currentTime;
        const startTime = currentTime + 0.005; // Légère avance pour synchronisation
        const grainDuration = availableDuration / playRate; // Durée réelle avec vitesse
        const stopTime = startTime + grainDuration;
        
        // Créer une fenêtre d'apodisation pour éliminer les artefacts
        const windowSamples = 100;
        const windowCurve = createWindow(WINDOW_TYPE, windowSamples);
        
        // Appliquer la courbe de gain
        const fadeInRatio = 0.15; // 15% de la durée totale
        const fadeOutRatio = 0.15; // 15% de la durée totale
        const fadeInDuration = grainDuration * fadeInRatio;
        const fadeOutDuration = grainDuration * fadeOutRatio;
        const plateauDuration = grainDuration - fadeInDuration - fadeOutDuration;
        
        // Remplir un tableau d'automation pour la courbe complète
        const fadeSteps = windowSamples * 2 + 1; // Nombre de pas pour la courbe complète
        const fullGainCurve = new Float32Array(fadeSteps);
        
        // Portion fade-in
        for (let i = 0; i < windowSamples; i++) {
            fullGainCurve[i] = windowCurve[i] * currentVolume;
        }
        
        // Portion plateau
        for (let i = windowSamples; i < windowSamples + 1; i++) {
            fullGainCurve[i] = currentVolume;
        }
        
        // Portion fade-out
        for (let i = 0; i < windowSamples; i++) {
            fullGainCurve[windowSamples + 1 + i] = windowCurve[windowSamples - 1 - i] * currentVolume;
        }
        
        // Appliquer la courbe complète
        try {
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.setValueCurveAtTime(fullGainCurve, startTime, grainDuration);
        } catch (e) {
            // Fallback en cas d'erreur: utiliser des rampes linéaires simples
            console.warn('[Audio] Erreur avec la courbe, utilisation du fallback:', e);
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(currentVolume, startTime + fadeInDuration);
            gainNode.gain.setValueAtTime(currentVolume, startTime + fadeInDuration + plateauDuration);
            gainNode.gain.linearRampToValueAtTime(0, stopTime);
        }
        
        // Démarrer la lecture avec offset précis
        try {
            source.start(startTime, grainPosition, availableDuration);
            source.stop(stopTime);
        } catch (e) {
            console.error('[Audio] Erreur de démarrage du grain:', e);
            return false;
        }
        
        // Stocker les informations sur la source pour la gestion
        source.endTime = stopTime;
        source.gainNode = gainNode;
        source.grainPosition = grainPosition;
        source.grainDuration = availableDuration;
        source.isPitchShifted = isPitchShifted;
        source.playRate = playRate;
        audioSources.push(source);
        
        // Mise à jour des logs (réduits pour ne pas surcharger)
        if (Math.random() < 0.02) { // Seulement ~2% des grains
            console.log(`[Audio] Grain: pos=${grainPosition.toFixed(2)}s, dur=${availableDuration.toFixed(3)}s, rate=${playRate.toFixed(2)}, pitch=${isPitchShifted}`);
        }
        
        return true;
    } catch (error) {
        console.error('[Audio] Erreur lors de la planification du grain vinyle:', error);
        return false;
    }
}

// Fonction principale de contrôle audio pour mode vinyle
function scheduleAudioLoop() {
    if (!isPlaying) return;
    
    const now = performance.now();
    const deltaTime = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    
    // Protection contre les grands intervalles (onglet inactif ou surcharge CPU)
    const safeDeltaTime = Math.min(deltaTime, 0.05); // Max 50ms
    
    // Mise à jour de la position en fonction de la direction et de la vitesse
    let positionChange = safeDeltaTime * playbackRate * playDirection;
    
    // Protection contre les sauts trop grands en lecture arrière à haute vitesse
    if (playDirection < 0 && Math.abs(playbackRate) > 2.0) {
        // Limiter la vitesse de déplacement arrière pour éviter la boucle
        const maxBackwardChange = safeDeltaTime * 2.0;
        if (Math.abs(positionChange) > maxBackwardChange) {
            positionChange = -maxBackwardChange;
        }
    }
    
    // Appliquer le changement de position
    playbackPosition += positionChange;
    
    // Limiter la position entre 0 et la durée du morceau
    if (playbackPosition < 0) {
        playbackPosition = 0;
        console.log("[Audio] Début du morceau atteint");
    } else if (playbackPosition > audioBuffer.duration) {
        playbackPosition = audioBuffer.duration;
        console.log("[Audio] Fin du morceau atteinte");
    }
    
    // Mettre à jour le filtre en fonction de la vitesse et direction
    updateAdvancedFilter(playbackRate, playDirection);
    
    // Planifier suffisamment de grains à l'avance
    // Adaptation: nombre de grains augmente avec la vitesse pour une couverture complète
    const grainsNeeded = 1 + Math.ceil(Math.abs(playbackRate) / 1.5);
    for (let i = 0; i < grainsNeeded; i++) {
        if (pendingGrainQueue.length < MAX_ACTIVE_GRAINS / 2) {
            const success = scheduleGrain();
            if (success) {
                pendingGrainQueue.push(now);
            }
        }
    }
    
    // Nettoyer la file des grains planifiés
    const grainLifetime = (GRAIN_SIZE * (1 - OVERLAP)) * 1000;
    while (pendingGrainQueue.length > 0 && now - pendingGrainQueue[0] > grainLifetime) {
        pendingGrainQueue.shift();
    }
    
    // Mettre à jour l'affichage
    updatePlaybackDisplay();
    
    // Continuer la boucle
    audioFrameId = setTimeout(scheduleAudioLoop, UPDATE_INTERVAL);
}

// Démarrer la lecture
function startAudio() {
    if (!audioBuffer || isPlaying) return;
    
    // Réveiller le contexte audio si nécessaire
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('[Audio] Contexte audio repris');
        }).catch(e => {
            console.error('[Audio] Erreur lors de la reprise du contexte:', e);
        });
    }
    
    // Initialiser le système si nécessaire
    if (!processingChain) {
        processingChain = createAdvancedAudioProcessingGraph();
    }
    
    // Réinitialiser les variables de suivi
    isPlaying = true;
    lastFrameTime = performance.now();
    audioSources = [];
    pendingGrainQueue = [];
    lastReportedPosition = playbackPosition;
    lastPositionUpdate = performance.now();
    isPositionLooping = false;
    
    // Démarrer la boucle de contrôle
    if (audioFrameId) {
        clearTimeout(audioFrameId);
    }
    
    // Démarrer le mode vinyle
    scheduleAudioLoop();
    
    // Mettre à jour l'état
    const statusDisplay = document.getElementById('audioStatus');
    if (statusDisplay) {
        statusDisplay.textContent = 'État: Lecture (mode vinyle)';
        statusDisplay.style.color = '#2ecc71';
    }
    
    console.log(`[Audio] Lecture démarrée à la position ${playbackPosition.toFixed(2)}s`);
}

// Mettre en pause la lecture
function pauseAudio() {
    if (!isPlaying) return;
    
    isPlaying = false;
    
    // Arrêter la boucle d'animation
    if (audioFrameId) {
        clearTimeout(audioFrameId);
        audioFrameId = null;
    }
    
    // Arrêter proprement toutes les sources actives
    stopAllSources();
    
    // Mettre à jour l'état
    const statusDisplay = document.getElementById('audioStatus');
    if (statusDisplay) {
        statusDisplay.textContent = 'État: Pause';
        statusDisplay.style.color = '#f39c12';
    }
    
    console.log(`[Audio] Lecture mise en pause à la position ${playbackPosition.toFixed(2)}s`);
}

// Arrêter la lecture
function stopAudio() {
    if (!audioBuffer) return;
    
    isPlaying = false;
    
    // Arrêter la boucle d'animation
    if (audioFrameId) {
        clearTimeout(audioFrameId);
        audioFrameId = null;
    }
    
    // Arrêter proprement toutes les sources actives avec un fondu de sortie
    stopAllSources();
    
    // Réinitialiser la position
    playbackPosition = 0;
    
    // Mettre à jour l'état
    const statusDisplay = document.getElementById('audioStatus');
    if (statusDisplay) {
        statusDisplay.textContent = 'État: Arrêté';
        statusDisplay.style.color = '#666';
    }
    
    console.log('[Audio] Lecture arrêtée');
}

// Arrêter toutes les sources audio actives
function stopAllSources() {
    // Arrêter proprement toutes les sources actives
    const now = audioContext.currentTime;
    audioSources.forEach(source => {
        try {
            // Appliquer un fondu de sortie rapide
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
                    // Ignorer les erreurs, la source peut déjà être arrêtée
                }
            }, 60);
        } catch (e) {
            // Ignorer les erreurs, la source peut déjà être arrêtée
        }
    });
    
    // Vider la file d'attente après le fondu
    setTimeout(() => {
        audioSources = [];
    }, 100);
}

// Mettre à jour l'affichage de la lecture
function updatePlaybackDisplay() {
    if (!audioBuffer) return;
    
    // Mettre à jour l'affichage de la position
    const positionDisplay = document.getElementById('positionDisplay');
    if (positionDisplay) {
        const position = (playbackPosition / audioBuffer.duration) * 100;
        const formattedTime = formatTime(playbackPosition);
        const totalTime = formatTime(audioBuffer.duration);
        positionDisplay.textContent = `Position: ${Math.round(position)}% (${formattedTime} / ${totalTime})`;
    }
    
    // Mettre à jour l'affichage de la vitesse
    const speedDisplay = document.getElementById('speedDisplay');
    if (speedDisplay) {
        const directionText = playDirection > 0 ? "avant" : "arrière";
        speedDisplay.textContent = `Vitesse: ${Math.abs(playbackRate).toFixed(2)}x (${directionText})`;
    }
    
    // Mettre à jour l'affichage du volume
    const volumeDisplay = document.getElementById('volumeDisplay');
    if (volumeDisplay) {
        volumeDisplay.textContent = `Volume: ${Math.round(currentVolume * 100)}%`;
    }
}

// Fonction de diagnostic pour l'audio
function debugAudioState() {
    console.log('=== ÉTAT AUDIO ACTUEL ===');
    console.log(`Lecture: ${isPlaying ? 'Oui' : 'Non'}`);
    console.log(`Position: ${playbackPosition.toFixed(2)}s / ${audioBuffer ? audioBuffer.duration.toFixed(2) : 'N/A'}s`);
    console.log(`Direction: ${playDirection > 0 ? 'Avant' : 'Arrière'}`);
    console.log(`Vitesse: ${playbackRate.toFixed(2)}x`);
    console.log(`Volume: ${(currentVolume * 100).toFixed(1)}%`);
    console.log(`Grains actifs: ${audioSources.length}`);
    console.log(`État du contexte audio: ${audioContext ? audioContext.state : 'N/A'}`);
    console.log(`Taille des grains: ${GRAIN_SIZE}s`);
    console.log(`Chevauchement: ${OVERLAP * 100}%`);
    console.log(`Mode fenêtre: ${WINDOW_TYPE}`);
    console.log(`Mode pitch shift: ${PITCH_SHIFT_MODE ? 'Activé' : 'Désactivé'}`);
    console.log(`Détection de boucle: ${isPositionLooping ? 'OUI' : 'Non'}`);
    
    if (processingChain) {
        console.log(`Filtre - Fréquence: ${processingChain.lowpass.frequency.value.toFixed(1)}Hz, Q: ${processingChain.lowpass.Q.value.toFixed(2)}`);
        console.log(`Égaliseur - Freq: ${processingChain.equalizer.frequency.value}Hz, Gain: ${processingChain.equalizer.gain.value}dB`);
        console.log(`Compresseur - Threshold: ${processingChain.compressor.threshold.value}dB, Ratio: ${processingChain.compressor.ratio.value}:1`);
    }
    
    // Si des grains actifs, afficher leurs détails
    if (audioSources.length > 0) {
        console.log('--- Grains actifs ---');
        const now = audioContext.currentTime;
        audioSources.forEach((source, index) => {
            if (index < 5) { // Limiter à 5 pour éviter de surcharger la console
                console.log(`Grain #${index}: position=${source.grainPosition?.toFixed(2) || '?'}s, fin dans ${(source.endTime - now).toFixed(3)}s, pitch=${source.isPitchShifted ? 'Oui' : 'Non'}`);
            }
        });
        if (audioSources.length > 5) {
            console.log(`... et ${audioSources.length - 5} autres grains`);
        }
    }
    
    console.log('=======================');
}

// Formatage du temps (secondes -> MM:SS)
function formatTime(timeInSeconds) {
    if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Contrôle audio avec les capteurs
function updateAudioControls(deltaTime) {
    // Vérifier les prérequis
    if (!audioBuffer) return;
    
    // CAPTEUR DROIT (Y/Pitch) - contrôle du volume
    const volumeValue = angleToNormalizedValue(currentValues.rightY);
    const volumePercentage = 50 + (volumeValue * 50);
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
    
    // Calculer la vitesse et la direction
    let newSpeed = 0;
    let newDirection = 1;
    
    if (speedValue >= 0) {
        // Vitesse positive (avant)
        newSpeed = 1.0 + speedValue;
        newDirection = 1;
    } else {
        // Vitesse négative (arrière)
        newSpeed = Math.abs(speedValue * 2);
        newDirection = -1;
    }
    
    // Arrondir pour éviter les micro-variations
    newSpeed = Math.round(newSpeed * 100) / 100;
    
    // Si changement significatif de vitesse ou de direction
    if (Math.abs(newSpeed - playbackRate) > 0.05 || newDirection !== playDirection) {
        // Si proche de zéro, mettre en pause
        if (newSpeed < 0.05) {
            pauseAudio();
            
            // Mise à jour de l'affichage
            const speedDisplay = document.getElementById('speedDisplay');
            if (speedDisplay) {
                speedDisplay.textContent = `Vitesse: 0.00x (pause)`;
            }
            return;
        }
        
        const directionChanged = newDirection !== playDirection;
        
        // Mise à jour de la vitesse et de la direction
        playbackRate = newSpeed;
        playDirection = newDirection;
        
        // Si changement de direction, appliquer immédiatement les nouveaux filtres
        if (directionChanged && processingChain) {
            updateAdvancedFilter(playbackRate, playDirection);
        }
        
        // Si pas déjà en lecture, démarrer
        if (!isPlaying) {
            startAudio();
        }
        
        // Mise à jour de l'affichage de la vitesse
        const speedDisplay = document.getElementById('speedDisplay');
        if (speedDisplay) {
            const directionText = playDirection > 0 ? "avant" : "arrière";
            speedDisplay.textContent = `Vitesse: ${Math.abs(playbackRate).toFixed(2)}x (${directionText})`;
        }
    }
}

// Initialiser l'audio lorsque la page est chargée
document.addEventListener('DOMContentLoaded', () => {
    try {
        initAudio();
        
        // Nettoyer si nécessaire
        window.addEventListener('beforeunload', () => {
            stopAnimationLoop();
            stopAudio();
        });
    } catch (e) {
        console.error('[Démarrage] Erreur initialisation:', e);
    }
});