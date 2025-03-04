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

// Variables globales pour l'audio
let audioElement = null
let audioContext = null
let audioBuffer = null
let reversedAudioBuffer = null
let audioSource = null
let gainNode = null
let playDirection = 1 // 1 = avant, -1 = arrière
let manualPlaybackRate = 1.0
let currentVolume = 1.0
let isReversePlayback = false
let playbackStartTime = 0
let playbackOffsetTime = 0

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

// --- Fonctions Audio Améliorées ---

// Prépare le buffer audio inversé
function prepareReversedBuffer() {
    if (!audioBuffer || !audioContext) return null
    
    try {
        reversedAudioBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        )
        
        // Pour chaque canal audio
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const originalData = audioBuffer.getChannelData(channel)
            const reversedData = reversedAudioBuffer.getChannelData(channel)
            
            // Copier les données en sens inverse
            for (let i = 0; i < originalData.length; i++) {
                reversedData[i] = originalData[originalData.length - 1 - i]
            }
        }
        
        console.log("[Audio] Buffer inversé préparé avec succès")
        return reversedAudioBuffer
    } catch (error) {
        console.error("[Audio] Erreur lors de la préparation du buffer inversé:", error)
        return null
    }
}

// Joue l'audio avec la direction et la vitesse spécifiées
function playAudio(direction, speed) {
    try {
        // Si aucun buffer audio, utiliser l'élément audio standard
        if (!audioBuffer) {
            if (direction > 0) {
                // Lecture en avant standard
                audioElement.playbackRate = speed
                if (audioElement.paused) {
                    audioElement.play()
                }
                return
            } else {
                console.log("[Audio] Lecture inversée impossible sans buffer audio")
                return
            }
        }
        
        // Arrêter toute lecture en cours
        stopPlayback()
        
        // Créer une nouvelle source audio
        audioSource = audioContext.createBufferSource()
        
        // Créer un nœud de gain pour le volume
        gainNode = audioContext.createGain()
        gainNode.gain.value = currentVolume
        
        // Sélectionner le buffer en fonction de la direction
        if (direction > 0) {
            // Lecture en avant - buffer original
            audioSource.buffer = audioBuffer
            isReversePlayback = false
        } else {
            // Lecture en arrière - buffer inversé
            audioSource.buffer = reversedAudioBuffer
            isReversePlayback = true
        }
        
        // Définir la vitesse
        audioSource.playbackRate.value = Math.abs(speed)
        
        // Connecter au contexte audio
        audioSource.connect(gainNode)
        gainNode.connect(audioContext.destination)
        
        // Enregistrer le temps de début
        playbackStartTime = audioContext.currentTime
        
        // Démarrer la lecture
        audioSource.start(0)
        
        // Événement de fin
        audioSource.onended = function() {
            audioSource = null
            gainNode = null
        }
        
        console.log(`[Audio] Lecture en ${direction > 0 ? 'avant' : 'arrière'} à vitesse ${speed.toFixed(2)}x`)
    } catch (error) {
        console.error("[Audio] Erreur lors de la lecture:", error)
    }
}

// Arrête la lecture en cours
function stopPlayback() {
    if (audioSource) {
        try {
            audioSource.stop()
        } catch (e) {
            console.log("[Audio] Erreur lors de l'arrêt:", e)
        }
        audioSource = null
        gainNode = null
    }
    
    if (audioElement && !audioElement.paused) {
        audioElement.pause()
    }
}

// Réinitialise la position de lecture
function resetPosition() {
    if (audioElement) {
        audioElement.currentTime = 0
    }
    updateTimeDisplay()
    updatePositionDisplay()
}

// Met à jour l'affichage du temps
function updateTimeDisplay() {
    const timeDisplay = document.getElementById('timeDisplay')
    if (!timeDisplay || !audioElement || !audioElement.duration) return
    
    const currentTime = formatTime(audioElement.currentTime)
    const duration = formatTime(audioElement.duration)
    timeDisplay.textContent = `${currentTime} / ${duration}`
}

// Met à jour l'affichage de la position
function updatePositionDisplay() {
    const positionDisplay = document.getElementById('positionDisplay')
    if (!positionDisplay || (!audioElement && !audioBuffer)) return
    
    let position = 0
    let duration = audioBuffer ? audioBuffer.duration : (audioElement.duration || 0)
    
    if (audioSource && audioContext) {
        // Si on utilise Web Audio API
        const elapsedTime = audioContext.currentTime - playbackStartTime
        if (isReversePlayback) {
            // Lecture inversée
            position = 100 - (elapsedTime * audioSource.playbackRate.value * 100 / duration)
        } else {
            // Lecture normale
            position = elapsedTime * audioSource.playbackRate.value * 100 / duration
        }
    } else if (audioElement && audioElement.duration) {
        // Lecture avec l'élément standard
        position = (audioElement.currentTime / audioElement.duration) * 100
    }
    
    // Limiter entre 0 et 100%
    position = Math.max(0, Math.min(100, position))
    positionDisplay.textContent = `Position: ${Math.round(position)}%`
}

// Met à jour l'affichage de la vitesse
function updateSpeedDisplay() {
    const speedDisplay = document.getElementById('speedDisplay')
    if (!speedDisplay) return
    
    const directionText = playDirection > 0 ? "avant" : "arrière"
    speedDisplay.textContent = `Vitesse: ${Math.abs(manualPlaybackRate).toFixed(2)}x (${directionText})`
}

// Formatage du temps (secondes -> MM:SS)
function formatTime(timeInSeconds) {
    if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00"
    const minutes = Math.floor(timeInSeconds / 60)
    const seconds = Math.floor(timeInSeconds % 60)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// Contrôle audio avec les capteurs
function updateAudioControls(deltaTime) {
    // Vérifier les prérequis
    if (!audioElement || !audioElement.src) return
    
    // Récupérer les références aux éléments DOM à chaque appel pour éviter les erreurs
    const speedDisplay = document.getElementById('speedDisplay')
    const volumeDisplay = document.getElementById('volumeDisplay')
    const positionDisplay = document.getElementById('positionDisplay')
    
    // CAPTEUR DROIT (Y/Pitch) - contrôle du volume
    const volumeValue = angleToNormalizedValue(currentValues.rightY)
    const volumePercentage = 50 + (volumeValue * 50)
    const volumeFinal = Math.min(100, Math.max(0, volumePercentage))
    
    // Appliquer le volume
    currentVolume = volumeFinal / 100
    if (gainNode) {
        gainNode.gain.value = currentVolume
    } else if (audioElement) {
        audioElement.volume = currentVolume
    }
    
    // Mise à jour de l'affichage du volume
    if (volumeDisplay) {
        volumeDisplay.textContent = `Volume: ${Math.round(volumeFinal)}%`
    }
    
    // CAPTEUR GAUCHE (Y/Pitch) - contrôle de la vitesse et direction
    const speedValue = angleToNormalizedValue(currentValues.leftY)
    
    // Calculer la vitesse et la direction
    let newSpeed = 0
    let newDirection = 1
    
    if (speedValue >= 0) {
        // Vitesse positive (avant)
        newSpeed = 1.0 + speedValue
        newDirection = 1
    } else {
        // Vitesse négative (arrière)
        newSpeed = Math.abs(speedValue * 2)
        newDirection = -1
    }
    
    // Arrondir pour éviter les micro-variations
    newSpeed = Math.round(newSpeed * 100) / 100
    
    // Si changement significatif de vitesse ou de direction
    if (Math.abs(newSpeed - manualPlaybackRate) > 0.05 || newDirection !== playDirection) {
        // Si proche de zéro, mettre en pause
        if (newSpeed < 0.05) {
            stopPlayback()
            if (speedDisplay) {
                speedDisplay.textContent = `Vitesse: 0.00x (pause)`
            }
            return
        }
        
        // Mise à jour des valeurs
        const oldDirection = playDirection
        playDirection = newDirection
        manualPlaybackRate = newSpeed
        
        // Si la direction a changé ou si aucune lecture n'est en cours
        if (oldDirection !== newDirection || (!audioSource && !audioElement)) {
            playAudio(playDirection, manualPlaybackRate)
        } 
        // Sinon juste modifier la vitesse
        else if (audioSource) {
            audioSource.playbackRate.value = manualPlaybackRate
        } else if (audioElement && playDirection > 0) {
            audioElement.playbackRate = manualPlaybackRate
        }
        
        // Mise à jour de l'affichage
        if (speedDisplay) {
            const directionText = playDirection > 0 ? "avant" : "arrière"
            speedDisplay.textContent = `Vitesse: ${Math.abs(manualPlaybackRate).toFixed(2)}x (${directionText})`
        }
    }
    
    // Mise à jour de la position
    updatePositionDisplay()
}

// Initialisation de l'audio
function initAudio() {
    try {
        audioElement = document.createElement('audio')
        document.body.appendChild(audioElement)
        
        // Initialiser le contexte audio
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
        console.log('[Audio] Contexte audio créé')
    } catch (e) {
        console.error('[Audio] Erreur création contexte audio:', e)
    }
    
    try {
        // Sélection du fichier
        const fileInput = document.getElementById('audioFile')
        const playButton = document.getElementById('playButton')
        const pauseButton = document.getElementById('pauseButton')
        const stopButton = document.getElementById('stopButton')
        
        fileInput.addEventListener('change', async function(e) {
            const file = e.target.files[0]
            if (!file) return
            
            // URL pour l'élément audio standard
            const fileURL = URL.createObjectURL(file)
            audioElement.src = fileURL
            audioElement.load()
            
            // Chargement parallèle pour Web Audio API (lecture inversée)
            try {
                // Lire le fichier comme ArrayBuffer
                const reader = new FileReader()
                reader.onload = async function(event) {
                    const arrayBuffer = event.target.result
                    
                    try {
                        // Décoder les données audio
                        audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
                        
                        // Préparer le buffer inversé
                        prepareReversedBuffer()
                        
                        console.log(`[Audio] Fichier chargé et décodé: ${file.name}`)
                    } catch (decodeError) {
                        console.error('[Audio] Erreur lors du décodage:', decodeError)
                    }
                }
                
                reader.onerror = function(event) {
                    console.error('[Audio] Erreur lecture fichier:', event)
                }
                
                reader.readAsArrayBuffer(file)
            } catch (error) {
                console.error('[Audio] Erreur lors du chargement:', error)
            }
        })
        
        if (playButton) {
            playButton.addEventListener('click', function() {
                if (!audioElement.src) {
                    alert('Veuillez sélectionner un fichier audio')
                    return
                }
                
                if (audioContext.state === 'suspended') {
                    audioContext.resume()
                }
                
                // Lecture en mode normal
                playDirection = 1
                manualPlaybackRate = 1.0
                playAudio(playDirection, manualPlaybackRate)
                
                // Mise à jour de l'affichage
                updateSpeedDisplay()
            })
        }
        
        if (pauseButton) {
            pauseButton.addEventListener('click', function() {
                stopPlayback()
            })
        }
        
        if (stopButton) {
            stopButton.addEventListener('click', function() {
                stopPlayback()
                resetPosition()
                
                // Réinitialiser les contrôles
                manualPlaybackRate = 1.0
                playDirection = 1
                
                // Mise à jour des affichages
                updateSpeedDisplay()
            })
        }
        
        // Mise à jour de l'affichage du temps
        audioElement.addEventListener('timeupdate', function() {
            updateTimeDisplay()
            
            // Mettre à jour l'affichage de position si pas en mode Web Audio API
            if (!audioSource) {
                updatePositionDisplay()
            }
        })
    } catch (initError) {
        console.error('[Audio] Erreur initialisation audio:', initError)
    }
}

// Initialiser l'audio lorsque la page est chargée
document.addEventListener('DOMContentLoaded', () => {
    try {
        initAudio()
        
        // Nettoyer si nécessaire
        window.addEventListener('beforeunload', () => {
            stopAnimationLoop()
            stopPlayback()
        })
    } catch (e) {
        console.error('[Démarrage] Erreur initialisation:', e)
    }
})