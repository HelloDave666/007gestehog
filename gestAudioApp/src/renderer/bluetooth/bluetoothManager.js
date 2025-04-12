/**
 * Module de gestion Bluetooth pour Heart Of Glass
 * Gère les connexions et le traitement des données des capteurs
 */

const noble = require('@abandonware/noble');
const { EventEmitter } = require('events');

// Créer un émetteur d'événements pour communiquer avec d'autres modules
const bluetoothEvents = new EventEmitter();

// Variables globales pour les capteurs et l'interface
let isScanning = false;
let scanButton = null;
let deviceList = null;
const connectedDevices = new Set();
const sensorsWithData = new Set(); // Pour suivre les capteurs qui affichent des données

// IDs des capteurs - peuvent être modifiés depuis les paramètres
let SENSOR_LEFT = 'ce:de:c2:f5:17:be';
let SENSOR_RIGHT = 'f0:70:c4:de:d1:22';
const LEFT_COLOR = 'blue';
const RIGHT_COLOR = 'green';

const READ_BATTERY_CMD = Buffer.from([0xFF, 0xAA, 0x27, 0x64, 0x00]);

const calibrationOffsets = new Map();

// Variables pour les capteurs
let leftSensorData = { x: 0, y: 0, z: 0 };
let rightSensorData = { x: 0, y: 0, z: 0 };

// Variables pour le lissage (easing)
let targetValues = {
    leftX: 0, leftY: 0, leftZ: 0,
    rightX: 0, rightY: 0, rightZ: 0
};

let currentValues = {
    leftX: 0, leftY: 0, leftZ: 0,
    rightX: 0, rightY: 0, rightZ: 0
};

// Variables pour suivre les dernières valeurs d'angle (pour éviter les sauts)
let lastLeftY = 0;
let lastRightY = 0;
let jumpProtectionActive = false;

// Facteur d'easing (entre 0 et 1)
// Plus la valeur est faible, plus le lissage est important (0.05 = très lisse, 0.2 = plus réactif)
const EASING_FACTOR = 0.08;

// ID de la boucle d'animation
let animationFrameId = null;

/**
 * Initialise le système Bluetooth
 * @returns {boolean} - Succès de l'initialisation
 */
function initBluetoothSystem() {
    console.log('[Bluetooth] Initialisation du système Bluetooth');
    
    // Trouver les éléments d'interface
    scanButton = document.getElementById('scanButton');
    deviceList = document.getElementById('deviceList');
    
    if (!scanButton || !deviceList) {
        console.error('[Bluetooth] Éléments d\'interface introuvables');
        return false;
    }
    
    // Configurer les gestionnaires d'événements
    setupEventListeners();
    
    // Initialiser les variables
    isScanning = false;
    
    console.log('[Bluetooth] Système Bluetooth initialisé');
    return true;
}

/**
 * Configure les écouteurs d'événements pour le Bluetooth
 */
function setupEventListeners() {
    // Gestionnaire d'état Bluetooth
    noble.on('stateChange', async (state) => {
        if (state === 'poweredOn') {
            console.log('[Bluetooth] État: prêt');
        } else {
            console.log('[Bluetooth] État:', state);
        }
    });
    
    // Gestionnaire de découverte
    noble.on('discover', handleDiscoveredDevice);
    
    // Gestionnaire du bouton de scan
    if (scanButton) {
        scanButton.addEventListener('click', () => {
            console.log('[UI] Clic sur le bouton scan');
            
            // Vérifier si les deux capteurs sont déjà opérationnels
            const bothSensorsActive = areBothSensorsActive();
            
            if (bothSensorsActive) {
                console.log('[Scanner] Les capteurs sont déjà connectés et fonctionnels. Scan non nécessaire.');
                // Optionnel: Afficher une notification à l'utilisateur
                alert('Les capteurs sont déjà connectés et fonctionnels.');
                return;
            }
            
            if (!isScanning) {
                startScanning();
            } else {
                stopScanning();
            }
        });
    }
}

/**
 * Gère un périphérique Bluetooth découvert
 * @param {object} peripheral - Périphérique Bluetooth découvert
 */
function handleDiscoveredDevice(peripheral) {
    if (peripheral.advertisement.localName?.includes('WT901BLE67')) {
        console.log('[Découverte] Capteur trouvé:', peripheral.address);
        const deviceDiv = document.querySelector(`[data-address="${peripheral.address}"]`);
        const color = peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase() ? LEFT_COLOR : RIGHT_COLOR;
        
        if (!connectedDevices.has(peripheral.address.toLowerCase()) && peripheral.state !== 'connected') {
            peripheral.connect(error => {
                if (error) {
                    console.error('[Connexion] Erreur:', error);
                    if (deviceDiv) {
                        updateDeviceStatus(deviceDiv, false, color);
                    }
                    return;
                }
                
                console.log('[Connexion] Réussie pour:', peripheral.advertisement.localName);
                
                if (deviceDiv) {
                    updateDeviceStatus(deviceDiv, true, color);
                    updateDeviceInfo(deviceDiv, peripheral);
                }
                
                connectedDevices.add(peripheral.address.toLowerCase());
                
                // Vérifier si les deux capteurs sont connectés et affichent des données
                checkSensorsReadyAndStopScan();

                peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
                    if (error) {
                        console.error('[Services] Erreur découverte:', error);
                        return;
                    }

                    console.log('[Services] Découverts pour:', peripheral.address);
                    
                    // Envoi de la commande batterie uniquement pour le capteur gauche
                    if (peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase() && characteristics.length > 0) {
                        characteristics[0].write(READ_BATTERY_CMD, true, (error) => {
                            if (error) console.error('[Batterie] Erreur lecture:', error);
                        });
                    }

                    characteristics.forEach(characteristic => {
                        characteristic.notify(true, (error) => {
                            if (error) {
                                console.error('[Notification] Erreur:', error);
                                return;
                            }
                            
                            characteristic.on('data', (data) => {
                                if (!data || data.length < 1) return;
                                
                                if (data[0] === 0x55) {
                                    // Traiter les données de batterie seulement pour le capteur gauche
                                    if (data[1] === 0x71 && peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase()) {
                                        console.log('[Données] Batterie reçues pour capteur gauche');
                                        updateBatteryLevel(deviceDiv, data);
                                    }
                                    // Traiter les données d'angle pour les deux capteurs
                                    else if (data[1] === 0x61) {
                                        const sensorData = processData(data, peripheral.address);
                                        if (sensorData && deviceDiv) {
                                            const sensorDataDiv = deviceDiv.querySelector('.info-sensor');
                                            sensorDataDiv.innerHTML = `
                                                <h3>Données capteur</h3>
                                                <p style="color: ${color}">Roll (X): ${sensorData.x}°</p>
                                                <p style="color: ${color}">Pitch (Y): ${sensorData.y}°</p>
                                                <p style="color: ${color}">Yaw (Z): ${sensorData.z}°</p>
                                            `;
                                        }
                                    }
                                }
                            });
                        });
                    });
                });
            });

            peripheral.once('disconnect', () => {
                console.log('[Déconnexion] Détectée pour:', peripheral.address);
                connectedDevices.delete(peripheral.address.toLowerCase());
                sensorsWithData.delete(peripheral.address.toLowerCase());
                
                if (deviceDiv) {
                    updateDeviceStatus(deviceDiv, false, color);
                }
                
                // Arrêter la boucle d'animation si l'un des capteurs se déconnecte
                if (!areBothSensorsActive()) {
                    stopAnimationLoop();
                }
                
                // Réactiver le bouton si un capteur se déconnecte
                enableScanButton("Rechercher les capteurs", "#4CAF50", true);
                
                // Émettre un événement de déconnexion
                bluetoothEvents.emit('deviceDisconnected', {
                    address: peripheral.address,
                    isLeft: peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase()
                });
            });
        }

        if (deviceDiv) {
            updateDeviceInfo(deviceDiv, peripheral);
        }
    }
}

/**
 * Fonction pour vérifier si les deux capteurs sont actifs
 * @returns {boolean} - Vrai si les deux capteurs sont actifs
 */
function areBothSensorsActive() {
    return connectedDevices.has(SENSOR_LEFT.toLowerCase()) && 
           connectedDevices.has(SENSOR_RIGHT.toLowerCase()) &&
           sensorsWithData.has(SENSOR_LEFT.toLowerCase()) && 
           sensorsWithData.has(SENSOR_RIGHT.toLowerCase());
}

/**
 * Fonction pour vérifier si les deux capteurs sont connectés et affichent des données
 * @returns {boolean} - Vrai si les deux capteurs sont prêts
 */
function checkSensorsReadyAndStopScan() {
    const bothActive = areBothSensorsActive();
    
    console.log(`[État] Capteur gauche: ${connectedDevices.has(SENSOR_LEFT.toLowerCase()) ? 'connecté' : 'déconnecté'}, ${sensorsWithData.has(SENSOR_LEFT.toLowerCase()) ? 'données reçues' : 'pas de données'}`);
    console.log(`[État] Capteur droit: ${connectedDevices.has(SENSOR_RIGHT.toLowerCase()) ? 'connecté' : 'déconnecté'}, ${sensorsWithData.has(SENSOR_RIGHT.toLowerCase()) ? 'données reçues' : 'pas de données'}`);
    
    if (bothActive) {
        // Les capteurs sont actifs, mettre à jour le bouton dans tous les cas
        enableScanButton("Capteurs trouvés", "#3498db", false); // Bleu, non cliquable
        
        // Si le scan est en cours, l'arrêter
        if (isScanning) {
            console.log('[Scanner] Les deux capteurs sont opérationnels, arrêt automatique du scan');
            stopScanning();
        }
        
        // Émettre un événement que les deux capteurs sont prêts
        bluetoothEvents.emit('bothSensorsReady', {
            leftSensorId: SENSOR_LEFT,
            rightSensorId: SENSOR_RIGHT
        });
        
        return true;
    }
    return false;
}

/**
 * Fonction d'interpolation linéaire (lerp) pour le lissage
 * @param {number} start - Valeur de départ
 * @param {number} end - Valeur cible
 * @param {number} factor - Facteur de lissage (0-1)
 * @returns {number} - Valeur interpolée
 */
function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

/**
 * Fonction pour détecter les sauts brusques d'angle
 * @param {number} currentAngle - Angle actuel
 * @param {number} lastAngle - Dernier angle
 * @returns {boolean} - Vrai s'il y a un saut d'angle
 */
function detectAngleJump(currentAngle, lastAngle) {
    // Si la différence entre les angles est supérieure à 270 degrés, c'est probablement un saut de -180 à +180 ou vice versa
    const diff = Math.abs(currentAngle - lastAngle);
    return diff > 270;
}

/**
 * Fonction pour convertir l'angle en valeur normalisée entre -1 et 1
 * @param {number} angle - Angle en degrés
 * @returns {number} - Valeur normalisée
 */
function angleToNormalizedValue(angle) {
    // Plage d'angle maximale (±90 degrés)
    const maxAngle = 90;
    
    // Saturer l'angle dans la plage -maxAngle à +maxAngle
    const clampedAngle = Math.max(-maxAngle, Math.min(maxAngle, angle));
    
    // Normaliser à la plage -1 à 1
    return clampedAngle / maxAngle;
}

/**
 * Démarrer la boucle d'animation pour le lissage
 */
function startAnimationLoop() {
    if (animationFrameId) return; // Éviter les doublons
    
    let lastTimestamp = performance.now();
    
    function animate(timestamp) {
        // Calculer le delta time (en secondes)
        const deltaTime = (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;
        
        // Mettre à jour les valeurs actuelles avec un effet de lissage
        currentValues.leftX = lerp(currentValues.leftX, targetValues.leftX, EASING_FACTOR);
        currentValues.leftY = lerp(currentValues.leftY, targetValues.leftY, EASING_FACTOR);
        currentValues.leftZ = lerp(currentValues.leftZ, targetValues.leftZ, EASING_FACTOR);
        
        currentValues.rightX = lerp(currentValues.rightX, targetValues.rightX, EASING_FACTOR);
        currentValues.rightY = lerp(currentValues.rightY, targetValues.rightY, EASING_FACTOR);
        currentValues.rightZ = lerp(currentValues.rightZ, targetValues.rightZ, EASING_FACTOR);
        
        // Vérifier les sauts d'angle
        if (detectAngleJump(currentValues.leftY, lastLeftY) || 
            detectAngleJump(currentValues.rightY, lastRightY)) {
            console.log("[Angles] Saut d'angle détecté, activation protection");
            jumpProtectionActive = true;
            
            // Réactiver après un délai
            setTimeout(() => {
                jumpProtectionActive = false;
                console.log("[Angles] Protection désactivée");
            }, 1000);
        }
        
        // Stocker les dernières valeurs
        lastLeftY = currentValues.leftY;
        lastRightY = currentValues.rightY;
        
        // Émettre les données des capteurs pour les autres modules
        bluetoothEvents.emit('sensorDataUpdated', {
            deltaTime,
            leftSensor: {
                x: currentValues.leftX,
                y: currentValues.leftY,
                z: currentValues.leftZ,
            },
            rightSensor: {
                x: currentValues.rightX,
                y: currentValues.rightY,
                z: currentValues.rightZ,
            },
            jumpProtectionActive
        });
        
        // Vérifier l'état des capteurs
        checkSensorsReadyAndStopScan();
        
        // Continuer la boucle d'animation
        animationFrameId = requestAnimationFrame(animate);
    }
    
    animationFrameId = requestAnimationFrame(animate);
    console.log('[Animation] Démarrage de la boucle de lissage');
    
    // Émettre un événement de démarrage de l'animation
    bluetoothEvents.emit('animationLoopStarted');
}

/**
 * Arrêter la boucle d'animation
 */
function stopAnimationLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        console.log('[Animation] Arrêt de la boucle de lissage');
        
        // Émettre un événement d'arrêt de l'animation
        bluetoothEvents.emit('animationLoopStopped');
    }
}

/**
 * Désactiver le bouton de scan pendant la recherche
 */
function disableScanButton() {
    if (!scanButton) return; // Sécurité supplémentaire
    
    scanButton.disabled = true;
    scanButton.style.backgroundColor = '#e74c3c'; // Rouge
    scanButton.style.cursor = 'not-allowed';
    scanButton.textContent = 'Recherche en cours...';
    
    console.log('[UI] Bouton scan désactivé: Recherche en cours...');
}

/**
 * Mettre à jour l'état du bouton selon les paramètres
 * @param {string} text - Texte du bouton
 * @param {string} color - Couleur du bouton
 * @param {boolean} enabled - Si le bouton est activé
 */
function enableScanButton(text = "Rechercher les capteurs", color = "#4CAF50", enabled = true) {
    if (!scanButton) return; // Sécurité supplémentaire
    
    scanButton.disabled = !enabled;
    scanButton.style.backgroundColor = color;
    scanButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
    scanButton.textContent = text;
    
    console.log(`[UI] Bouton scan mis à jour: ${text}, couleur: ${color}, activé: ${enabled}`);
}

/**
 * Crée l'affichage pour un périphérique dans la liste
 * @param {string} position - Position du capteur (GAUCHE/DROIT)
 * @param {string} color - Couleur associée
 * @param {string} address - Adresse du périphérique
 * @returns {HTMLElement} - Élément créé
 */
function createDeviceDisplay(position, color, address) {
    console.log(`[UI] Création affichage pour ${position} (${address})`);
    const deviceDiv = document.createElement('div');
    deviceDiv.className = 'device-info';
    deviceDiv.setAttribute('data-address', address);
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
    `;
    return deviceDiv;
}

/**
 * Démarre le scan Bluetooth
 */
function startScanning() {
    console.log('[Scanner] Démarrage du scan');
    isScanning = true;
    disableScanButton();
    deviceList.innerHTML = '';
    calibrationOffsets.clear();
    connectedDevices.clear();
    sensorsWithData.clear();
    
    // Réinitialiser les valeurs des capteurs
    targetValues = { leftX: 0, leftY: 0, leftZ: 0, rightX: 0, rightY: 0, rightZ: 0 };
    currentValues = { leftX: 0, leftY: 0, leftZ: 0, rightX: 0, rightY: 0, rightZ: 0 };
    lastLeftY = 0;
    lastRightY = 0;
    jumpProtectionActive = false;
    
    // Arrêter l'animation si elle est en cours
    stopAnimationLoop();
    
    deviceList.appendChild(createDeviceDisplay('GAUCHE', LEFT_COLOR, SENSOR_LEFT));
    deviceList.appendChild(createDeviceDisplay('DROIT', RIGHT_COLOR, SENSOR_RIGHT));
    
    noble.startScanning();
    
    // Émettre un événement de début de scan
    bluetoothEvents.emit('scanningStarted');
}

/**
 * Arrête le scan Bluetooth
 */
function stopScanning() {
    console.log('[Scanner] Arrêt du scan');
    isScanning = false;
    noble.stopScanning();
    
    // Émettre un événement de fin de scan
    bluetoothEvents.emit('scanningStopped');
}

/**
 * Met à jour le statut d'un périphérique dans l'interface
 * @param {HTMLElement} deviceDiv - Élément DOM du périphérique
 * @param {boolean} connected - État de connexion
 * @param {string} color - Couleur associée
 */
function updateDeviceStatus(deviceDiv, connected, color) {
    if (!deviceDiv) {
        console.error('[UI] updateDeviceStatus: deviceDiv non trouvé');
        return;
    }

    console.log(`[UI] Mise à jour statut: ${connected ? 'connecté' : 'déconnecté'}`);
    const indicator = deviceDiv.querySelector('.status-indicator');
    indicator.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`;
    
    const stateText = deviceDiv.querySelector('.info-basic p:nth-child(5)');
    if (stateText) {
        stateText.style.color = color;
        stateText.textContent = `État de connexion: ${connected ? 'connecté' : 'déconnecté'}`;
    } else {
        console.error('[UI] updateDeviceStatus: élément état non trouvé');
    }
}

/**
 * Met à jour les informations d'un périphérique dans l'interface
 * @param {HTMLElement} deviceDiv - Élément DOM du périphérique
 * @param {object} peripheral - Périphérique Bluetooth
 */
function updateDeviceInfo(deviceDiv, peripheral) {
    if (!deviceDiv) {
        console.error('[UI] updateDeviceInfo: deviceDiv non trouvé');
        return;
    }
    
    console.log(`[UI] Mise à jour infos pour: ${peripheral.address}`);
    const color = peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase() ? LEFT_COLOR : RIGHT_COLOR;
    
    const infoBasic = deviceDiv.querySelector('.info-basic');
    if (!infoBasic) {
        console.error('[UI] updateDeviceInfo: .info-basic non trouvé');
        return;
    }

    // Préserver la valeur de batterie si c'est le capteur gauche
    let batteryText = 'Batterie: --%';
    if (peripheral.address.toLowerCase() === SENSOR_LEFT.toLowerCase()) {
        const batteryElement = deviceDiv.querySelector('.info-basic p:nth-child(6)');
        if (batteryElement) {
            batteryText = batteryElement.textContent;
        }
    }

    infoBasic.innerHTML = `
        <h3 style="color: ${color}">Infos Bluetooth (${getSensorInfo(peripheral.address).position})</h3>
        <p style="color: ${color}">Adresse: ${peripheral.address}</p>
        <p style="color: ${color}">RSSI: ${peripheral.rssi}dBm</p>
        <p style="color: ${color}">Force du signal: ${Math.abs(peripheral.rssi)}%</p>
        <p style="color: ${color}">État de connexion: ${peripheral.state}</p>
        <p style="color: ${color}">${batteryText}</p>
    `;
}

/**
 * Met à jour le niveau de batterie dans l'interface
 * @param {HTMLElement} deviceDiv - Élément DOM du périphérique
 * @param {Buffer} data - Données de batterie
 */
function updateBatteryLevel(deviceDiv, data) {
    if (!deviceDiv || data.length < 6) {
        console.error('[Batterie] Données invalides:', !deviceDiv ? 'deviceDiv manquant' : 'données trop courtes');
        return;
    }
    
    if (data[0] === 0x55 && data[1] === 0x71 && data[2] === 0x64) {
        const batteryValue = (data[5] << 8) | data[4];
        let percentage = 0;
        
        if (batteryValue > 830) percentage = 100;
        else if (batteryValue > 393) percentage = 90;
        else if (batteryValue > 387) percentage = 75;
        else if (batteryValue > 382) percentage = 60;
        else if (batteryValue > 379) percentage = 50;
        else if (batteryValue > 377) percentage = 40;
        else if (batteryValue > 373) percentage = 30;
        else if (batteryValue > 370) percentage = 20;
        else if (batteryValue > 368) percentage = 15;
        else if (batteryValue > 350) percentage = 10;
        else if (batteryValue > 340) percentage = 5;

        const address = deviceDiv.getAttribute('data-address');
        console.log(`[Batterie] Valeur: ${batteryValue}, Pourcentage: ${percentage}% pour ${address}`);
        
        const batteryText = deviceDiv.querySelector('.info-basic p:nth-child(6)');
        if (batteryText) {
            const color = address.toLowerCase() === SENSOR_LEFT.toLowerCase() ? LEFT_COLOR : RIGHT_COLOR;
            batteryText.style.color = color;
            batteryText.textContent = `Batterie: ${percentage}%`;
        } else {
            console.error('[Batterie] Élément batterie non trouvé dans le DOM');
        }
        
        // Émettre un événement de niveau de batterie
        bluetoothEvents.emit('batteryLevelUpdated', {
            address,
            percentage,
            value: batteryValue
        });
    }
}

/**
 * Obtient les informations d'un capteur selon son adresse
 * @param {string} address - Adresse du capteur
 * @returns {object} - Informations du capteur
 */
function getSensorInfo(address) {
    const addrLower = address.toLowerCase();
    if (addrLower === SENSOR_LEFT.toLowerCase()) return { position: 'GAUCHE', color: LEFT_COLOR };
    if (addrLower === SENSOR_RIGHT.toLowerCase()) return { position: 'DROIT', color: RIGHT_COLOR };
    return { position: 'INCONNU', color: 'black' };
}

/**
 * Normalise un angle
 * @param {number} angle - Angle à normaliser
 * @param {boolean} preserveFullRange - Si true, préserver la plage -180 à +180
 * @returns {number} - Angle normalisé
 */
function normalizeAngle(angle, preserveFullRange = false) {
    // Si on veut préserver la plage complète (-180 à +180)
    if (preserveFullRange) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }
    
    // Sinon, normaliser entre 0 et 360 (pour éviter les valeurs négatives)
    angle = angle % 360;
    if (angle < 0) angle += 360;
    return angle;
}

/**
 * Traite les données brutes d'un capteur
 * @param {Buffer} data - Données brutes
 * @param {string} address - Adresse du capteur
 * @returns {object|null} - Données traitées ou null en cas d'erreur
 */
function processData(data, address) {
    if (!data || data.length < 20) {
        console.error('[Données] Données invalides pour:', address);
        return null;
    }

    let angles = {
        x: ((data[15] << 8 | data[14]) / 32768 * 180),
        y: ((data[17] << 8 | data[16]) / 32768 * 180),
        z: ((data[19] << 8 | data[18]) / 32768 * 180)
    };

    if (!calibrationOffsets.has(address)) {
        console.log('[Calibration] Nouvelle calibration pour:', address);
        calibrationOffsets.set(address, {
            x: angles.x,
            y: angles.y,
            z: angles.z
        });
    }

    const offsets = calibrationOffsets.get(address);
    const normalizedAngles = {
        x: normalizeAngle(angles.x - offsets.x, true),
        y: normalizeAngle(angles.y - offsets.y, true),
        z: normalizeAngle(angles.z - offsets.z, true)
    };

    // Mettre à jour les valeurs cibles au lieu des valeurs actuelles
    if (address.toLowerCase() === SENSOR_LEFT.toLowerCase()) {
        targetValues.leftX = normalizedAngles.x;
        targetValues.leftY = normalizedAngles.y;
        targetValues.leftZ = normalizedAngles.z;
    } else if (address.toLowerCase() === SENSOR_RIGHT.toLowerCase()) {
        targetValues.rightX = normalizedAngles.x;
        targetValues.rightY = normalizedAngles.y;
        targetValues.rightZ = normalizedAngles.z;
    }

    // Marquer ce capteur comme ayant des données
    sensorsWithData.add(address.toLowerCase());
    
    // Vérifier si les deux capteurs sont actifs et démarrer l'animation si nécessaire
    if (areBothSensorsActive() && !animationFrameId) {
        startAnimationLoop();
    }
    
    // Vérifier l'état des capteurs après chaque mise à jour
    checkSensorsReadyAndStopScan();

    return {
        x: normalizedAngles.x.toFixed(1),
        y: normalizedAngles.y.toFixed(1),
        z: normalizedAngles.z.toFixed(1)
    };
}

/**
 * Met à jour les IDs des capteurs
 * @param {string} leftId - ID du capteur gauche
 * @param {string} rightId - ID du capteur droit
 * @param {boolean} swapHands - Si true, inverser les mains
 */
function updateSensorIds(leftId, rightId, swapHands = false) {
    if (swapHands) {
        SENSOR_LEFT = rightId;
        SENSOR_RIGHT = leftId;
    } else {
        SENSOR_LEFT = leftId;
        SENSOR_RIGHT = rightId;
    }
    
    console.log(`[Capteurs] IDs mis à jour: Gauche=${SENSOR_LEFT}, Droite=${SENSOR_RIGHT}`);
    
    // Émettre un événement de mise à jour des IDs
    bluetoothEvents.emit('sensorIdsUpdated', {
        leftId: SENSOR_LEFT,
        rightId: SENSOR_RIGHT,
        swapped: swapHands
    });
}

/**
 * Obtient les valeurs actuelles des capteurs
 * @returns {object} - Valeurs des capteurs
 */
function getCurrentSensorValues() {
    return {
        left: {
            x: currentValues.leftX,
            y: currentValues.leftY,
            z: currentValues.leftZ
        },
        right: {
            x: currentValues.rightX,
            y: currentValues.rightY,
            z: currentValues.rightZ
        },
        jumpProtectionActive
    };
}

// Exporter les fonctions et l'émetteur d'événements
module.exports = {
    initBluetoothSystem,
    startScanning,
    stopScanning,
    startAnimationLoop,
    stopAnimationLoop,
    updateSensorIds,
    getCurrentSensorValues,
    angleToNormalizedValue,
    bluetoothEvents
};