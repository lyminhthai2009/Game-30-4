// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// ... (Lấy tất cả các element khác: btnMoveLeft, ..., loadingScreen - GIỮ NGUYÊN NHƯ TRƯỚC)
const btnMoveLeft = document.getElementById('btn-move-left');
const btnMoveRight = document.getElementById('btn-move-right');
const btnAngleUp = document.getElementById('btn-angle-up');
const btnAngleDown = document.getElementById('btn-angle-down');
const btnPowerUp = document.getElementById('btn-power-up');
const btnPowerDown = document.getElementById('btn-power-down');
const btnFire = document.getElementById('btn-fire');
const powerDisplay = document.getElementById('power-display');
const levelDisplay = document.getElementById('level');
const turnDisplay = document.getElementById('turn');
const playerHealthDisplay = document.getElementById('player-health');
const enemyHealthDisplay = document.getElementById('enemy-health');
const windInfoDisplay = document.getElementById('wind-info');
const ammoSelect = document.getElementById('ammo-select');
const ammoCountDisplay = document.getElementById('ammo-count');
const btnToggleMusic = document.getElementById('btn-toggle-music');
const loadingScreen = document.getElementById('loading-screen');

// --- Game Constants ---
// ... (canvasWidth, ..., windChangeInterval - GIỮ NGUYÊN NHƯ TRƯỚC)
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
const gravity = 0.16; // Slightly stronger gravity maybe?
const terrainResolution = 5;
const maxPower = 100;
const minPower = 10;
const windChangeInterval = 6000; // ms
const TRAJECTORY_STEPS = 40; // Số bước để vẽ đường đạn dự kiến
const TRAJECTORY_STEP_TIME = 0.1; // Thời gian mô phỏng cho mỗi bước trajectory

// --- Game State ---
// ... (level, ..., aiThinking, userInteracted - GIỮ NGUYÊN NHƯ TRƯỚC)
let level = 1;
let currentPlayer = 'player';
let projectile = null;
let secondaryProjectiles = [];
let particles = [];
let tanks = [];
let walls = [];
let terrainHeights = [];
let gameOver = false;
let currentPower = 50;
let windSpeed = 0;
let windChangeTimer = 0;
let lastTime = 0;
let assetsFullyLoaded = false;
let aiThinking = false;
let userInteracted = false;

// --- Polish State ---
let screenShakeIntensity = 0;
let screenShakeDuration = 0;

// --- Ammo Data ---
// ... (ammoTypes, playerCurrentAmmo, playerAmmoCounts, enemyCurrentAmmo - GIỮ NGUYÊN NHƯ TRƯỚC)
const ammoTypes = {
    normal: { name: "Thường", damage: [25, 35], effect: null, radius: 5 },
    cluster: { name: "Chùm", damage: [10, 15], count: 4, spread: 40, effect: 'cluster', radius: 5 },
    heavy: { name: "Nặng", damage: [40, 55], effect: 'heavy_impact', radius: 7 },
};
let playerCurrentAmmo = 'normal';
let playerAmmoCounts = { normal: Infinity, cluster: 3, heavy: 2 };
let enemyCurrentAmmo = 'normal';

// --- Asset Variables ---
// ... (imgTankBlue, ..., isMusicPlaying - GIỮ NGUYÊN NHƯ TRƯỚC)
let imgTankBlue, imgTankRed, imgBarrel, imgBackground, imgExplosionSheet, imgWall, imgGround;
let audioContext;
let soundBuffers = {};
let musicSource = null;
let isMusicPlaying = false;

// --- Asset Loading Status ---
let loadedAssetStatus = {};

// --- Asset Loading Functions (loadImage, initAudio, loadAudio, loadAssets) ---
// *** GIỮ NGUYÊN TOÀN BỘ PHẦN CODE TẢI ASSET TỪ PHIÊN BẢN TRƯỚC ***
// (Bao gồm cả việc sử dụng Promise.allSettled và xử lý audio sau tương tác)
// --- Image Loading ---
function loadImage(src) {
    loadedAssetStatus[src] = 'loading';
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            loadedAssetStatus[src] = 'loaded';
            resolve(img);
        };
        img.onerror = (err) => {
            loadedAssetStatus[src] = 'error';
            console.error(`ERROR: Failed to load image: ${src}`, err);
            reject(new Error(`Failed to load image: ${src}`));
        };
        img.src = src;
    });
}
// --- Audio Loading ---
function initAudio() {
    if (!userInteracted) {
        // console.log("AudioContext deferred until user interaction.");
        return false;
    }
    if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`AudioContext state: ${audioContext.state}`);
            if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    console.log('AudioContext resumed successfully.');
                }).catch(e => console.error('Error resuming AudioContext:', e));
            }
            return true;
        } catch (e) { console.error("Web Audio API is not supported or failed to initialize.", e); return false; }
    } else if (!audioContext) { console.warn("Web Audio API not supported."); return false; }
    if (audioContext.state === 'suspended') {
         audioContext.resume().catch(e => console.error('Error resuming existing AudioContext:', e));
    }
    return true;
}
function loadAudio(url) {
    if (!audioContext || audioContext.state !== 'running') {
         loadedAssetStatus[url] = 'deferred';
         return Promise.resolve(null);
    }
    loadedAssetStatus[url] = 'loading';
    return fetch(url)
        .then(response => { if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`); return response.arrayBuffer(); })
        .then(arrayBuffer => { if (!audioContext) throw new Error("AudioContext destroyed before decoding."); return audioContext.decodeAudioData(arrayBuffer); })
        .then(decodedBuffer => { loadedAssetStatus[url] = 'loaded'; return decodedBuffer; })
        .catch(error => { loadedAssetStatus[url] = 'error'; console.error(`ERROR: Failed to load or decode audio ${url}:`, error); return null; });
}
// --- Load All Assets (Revised with Promise.allSettled) ---
async function loadAssets() {
    console.log("Starting asset loading...");
    loadingScreen.classList.add('visible');

    const assetsToLoad = [
        { type: 'image', src: 'assets/images/tank_blue.png', target: 'imgTankBlue' },
        { type: 'image', src: 'assets/images/tank_red.png', target: 'imgTankRed' },
        { type: 'image', src: 'assets/images/barrel.png', target: 'imgBarrel' },
        { type: 'image', src: 'assets/images/background.png', target: 'imgBackground' },
        { type: 'image', src: 'assets/images/explosion_spritesheet.png', target: 'imgExplosionSheet' },
        { type: 'audio', src: 'assets/sounds/fire.wav', target: 'fire' },
        { type: 'audio', src: 'assets/sounds/explode.wav', target: 'explode' },
        { type: 'audio', src: 'assets/sounds/music.mp3', target: 'music' },
        { type: 'audio', src: 'assets/sounds/empty_click.wav', target: 'empty' }
    ];

    // Store the audio loading function globally so the interaction handler can call it
    window.tryLoadAudioDeferred = async () => {
        if (!initAudio()) { console.warn("AudioContext still not ready. Cannot load audio yet."); return; }
        console.log("Attempting deferred audio loading...");
        const audioAssets = assetsToLoad.filter(a => a.type === 'audio');
        const audioLoadPromises = audioAssets.map(asset =>
            loadAudio(asset.src).then(buffer => ({ target: asset.target, data: buffer, status: 'fulfilled', src: asset.src }))
                              .catch(error => ({ target: asset.target, reason: error, status: 'rejected', src: asset.src }))
        );
        const audioResults = await Promise.allSettled(audioLoadPromises);
        audioResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value && result.value.data) {
                soundBuffers[result.value.target] = result.value.data;
                console.log(`Deferred Loaded Audio: ${result.value.src}`);
            } else if (result.status === 'rejected') {
                const failedSrc = result.reason?.message?.match(/assets\/sounds\/[^:\s]+/)?.[0] || 'Unknown Audio';
                console.error(`Deferred Failed Audio: ${failedSrc} - Reason:`, result.reason);
            }
        });
        console.log("Deferred audio loading attempt finished.");
    };

    const imagePromises = assetsToLoad.filter(a => a.type === 'image').map(asset =>
        loadImage(asset.src).then(img => ({ target: asset.target, data: img, status: 'fulfilled', src: asset.src }))
                          .catch(error => ({ target: asset.target, reason: error, status: 'rejected', src: asset.src }))
    );

    console.log("Waiting for image promises...");
    const imageResults = await Promise.allSettled(imagePromises);
    let allImagesLoaded = true;
    imageResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value && result.value.data) {
            window[result.value.target] = result.value.data;
            console.log(`Loaded: ${result.value.src}`);
        } else if (result.status === 'rejected') {
            allImagesLoaded = false;
            // Gán null và log lỗi chi tiết hơn
            const failedSrc = result.reason?.message?.match(/assets\/images\/[^:\s]+/)?.[0] || 'Unknown Image';
            const targetVar = assetsToLoad.find(a => a.src === failedSrc)?.target;
            if(targetVar) window[targetVar] = null;
            console.error(`Failed Image: ${failedSrc} - Reason:`, result.reason);
        }
    });

    console.log(`Image loading finished. All images OK: ${allImagesLoaded}`);
    assetsFullyLoaded = true; // Game can start drawing now

    if (userInteracted) {
        window.tryLoadAudioDeferred(); // Load audio immediately if already interacted
    } else {
        console.log("Audio loading deferred. Waiting for user interaction.");
    }

    console.log("Asset loading process complete (game can start).");
    loadingScreen.classList.remove('visible');
    startGameLogic();
}

// --- Sound Playback Functions (playSound, toggleMusic) ---
// *** GIỮ NGUYÊN NHƯ TRƯỚC (Đã có kiểm tra context state) ***
function playSound(bufferName, volume = 1.0) {
    if (userInteracted && (!audioContext || audioContext.state !== 'running')) initAudio();
    if (!audioContext || audioContext.state !== 'running' || !soundBuffers[bufferName]) return;
    try {
        const source = audioContext.createBufferSource(); source.buffer = soundBuffers[bufferName];
        const gainNode = audioContext.createGain(); gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        source.connect(gainNode).connect(audioContext.destination); source.start(0);
    } catch (e) { console.error("Error playing sound:", bufferName, e); }
}
function toggleMusic() {
    if (userInteracted && (!audioContext || audioContext.state !== 'running')) initAudio();
    if (!audioContext || audioContext.state !== 'running' || !soundBuffers.music) { console.log("Cannot toggle music - Audio not ready or music buffer missing."); return; }
    if (isMusicPlaying) {
        if (musicSource) { try { musicSource.stop(); musicSource.disconnect(); } catch(e){} }
        isMusicPlaying = false; btnToggleMusic.textContent = "🎵 Tắt"; btnToggleMusic.classList.remove('playing');
    } else {
        musicSource = audioContext.createBufferSource(); musicSource.buffer = soundBuffers.music; musicSource.loop = true;
        const gainNode = audioContext.createGain(); gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
        musicSource.connect(gainNode).connect(audioContext.destination);
        try { musicSource.start(0); isMusicPlaying = true; btnToggleMusic.textContent = "🎵 Bật"; btnToggleMusic.classList.add('playing'); }
        catch(e) { console.error("Error starting music:", e); isMusicPlaying = false; }
    }
}

// --- Terrain Functions (generateTerrain, smoothTerrain, getTerrainHeightAt, modifyTerrain) ---
// *** GIỮ NGUYÊN NHƯ TRƯỚC ***
function generateTerrain() {
    terrainHeights = []; let currentHeight = canvasHeight * (0.6 + Math.random() * 0.2);
    for (let x = 0; x <= canvasWidth; x += terrainResolution) {
        terrainHeights.push(currentHeight); let heightChange = (Math.random() - 0.48) * 12;
        currentHeight += heightChange; currentHeight = Math.max(canvasHeight * 0.3, Math.min(canvasHeight - 40, currentHeight));
    }
    if (terrainHeights.length * terrainResolution < canvasWidth + terrainResolution) terrainHeights.push(currentHeight);
    smoothTerrain(2);
}
function smoothTerrain(passes) {
    if (terrainHeights.length < 3) return;
    for (let p = 0; p < passes; p++) {
        let smoothed = [terrainHeights[0]];
        for (let i = 1; i < terrainHeights.length - 1; i++) smoothed.push((terrainHeights[i - 1] + terrainHeights[i] * 1.5 + terrainHeights[i + 1]) / 3.5);
        smoothed.push(terrainHeights[terrainHeights.length - 1]); terrainHeights = smoothed;
    }
}
function getTerrainHeightAt(x) {
    if (!terrainHeights || terrainHeights.length === 0) return canvasHeight - 50; x = Math.max(0, Math.min(canvasWidth, x));
    const index = Math.floor(x / terrainResolution); const nextIndex = Math.min(index + 1, terrainHeights.length - 1);
    if (index >= terrainHeights.length -1 || index < 0) return terrainHeights[terrainHeights.length - 1] || canvasHeight - 50; // Boundary check
    const x1 = index * terrainResolution; const y1 = terrainHeights[index];
    const x2 = nextIndex * terrainResolution; const y2 = terrainHeights[nextIndex];
    if (x2 === x1) return y1; const t = (x - x1) / (x2 - x1); return y1 + (y2 - y1) * t;
}
function modifyTerrain(impactX, radius, depth) {
    if (!terrainHeights || terrainHeights.length === 0) return;
    const startIndex = Math.max(0, Math.floor((impactX - radius) / terrainResolution));
    const endIndex = Math.min(terrainHeights.length - 1, Math.ceil((impactX + radius) / terrainResolution));
    for (let i = startIndex; i <= endIndex; i++) {
        const currentX = i * terrainResolution; const distFromImpact = Math.abs(currentX - impactX);
        if (distFromImpact < radius) {
            const craterDepthFactor = (Math.cos((distFromImpact / radius) * Math.PI) + 1) / 2;
            terrainHeights[i] += depth * craterDepthFactor; terrainHeights[i] = Math.min(canvasHeight + 50, terrainHeights[i]);
        }
    }
}


// --- Classes ---

class Tank {
    // ... (constructor như trước, gán ảnh vào this.image, this.barrelImage)
    constructor(x, color, facingRight = true, isPlayer = false) {
        this.baseX = x; this.x = x; this.y = canvasHeight - 50;
        this.width = 70; this.height = 40; this.barrelPivotOffsetY = -this.height * 0.4; this.barrelLength = 35;
        this.angle = facingRight ? 45 : 135; this.color = color; this.health = 100; this.maxHealth = 100;
        this.facingRight = facingRight; this.isPlayer = isPlayer;
        this.image = isPlayer ? imgTankBlue : imgTankRed; this.barrelImage = imgBarrel; this.moveSpeed = 150;
        this.hitFlashDuration = 0; // For hit effect
    }

    updatePositionOnTerrain() { this.y = getTerrainHeightAt(this.x); }

    update(deltaTime) {
        // Update hit flash effect timer
        if (this.hitFlashDuration > 0) {
            this.hitFlashDuration -= deltaTime;
        }
    }

    draw() {
        ctx.save(); // Save context state before potential hit flash filter

        // Apply hit flash effect using filter
        if (this.hitFlashDuration > 0) {
             // Simple brightness flash
             const flashAmount = Math.sin(this.hitFlashDuration * Math.PI * 4) * 0.5 + 0.5; // Pulsating effect
             ctx.filter = `brightness(${1 + flashAmount * 1.5})`; // Increase brightness
        }

        // --- Vẽ thân xe (kiểm tra ảnh) ---
        const drawX = this.x - this.width / 2;
        const drawY = this.y - this.height;
        if (!this.image) {
            ctx.fillStyle = this.isPlayer ? 'blue' : 'red';
            ctx.fillRect(drawX, drawY, this.width, this.height);
            // Log warning once
            if (!window.loggedTankMissing) { console.warn("Tank image missing. Drawing fallback."); window.loggedTankMissing = true;}
        } else {
            ctx.drawImage(this.image, drawX, drawY, this.width, this.height);
        }

        // --- Vẽ nòng súng ---
        const angleRad = this.angle * (Math.PI / 180);
        const pivotX = this.x;
        const pivotY = this.y + this.barrelPivotOffsetY;
        ctx.save(); // Save for barrel rotation
        ctx.translate(pivotX, pivotY);
        ctx.rotate(-angleRad);
        if (this.barrelImage) {
            const barrelDrawWidth = 45; const barrelDrawHeight = 12;
            ctx.drawImage(this.barrelImage, 0, -barrelDrawHeight / 2, barrelDrawWidth, barrelDrawHeight);
        } else {
            ctx.fillStyle = 'grey'; ctx.fillRect(0, -3, this.barrelLength, 6);
            if (!window.loggedBarrelMissing) { console.warn("Barrel image missing. Drawing fallback."); window.loggedBarrelMissing = true; }
        }
        ctx.restore(); // Restore from barrel rotation

        ctx.restore(); // Restore from potential hit flash filter

        // --- Vẽ thanh máu (luôn vẽ) ---
        const healthBarY = drawY - 10;
        this.drawHealthBar(healthBarY);
    }

    // ... (drawHealthBar, move, aim, getBarrelEnd - Giữ nguyên như trước) ...
    drawHealthBar(yPos) {
        const barWidth = this.width * 0.8; const barHeight = 6; const barX = this.x - barWidth / 2;
        const healthPercent = Math.max(0, this.health / this.maxHealth);
        ctx.fillStyle = '#555'; ctx.fillRect(barX, yPos, barWidth, barHeight); // Darker background
        ctx.fillStyle = healthPercent > 0.5 ? '#28a745' : (healthPercent > 0.2 ? '#ffc107' : '#dc3545'); // Change color based on health
        ctx.fillRect(barX, yPos, barWidth * healthPercent, barHeight);
        ctx.strokeStyle = 'black'; ctx.lineWidth = 1; ctx.strokeRect(barX, yPos, barWidth, barHeight);
    }
    move(direction, deltaTime) {
        const moveAmount = direction * this.moveSpeed * deltaTime; const newX = this.x + moveAmount;
        if (newX > this.width / 3 && newX < canvasWidth - this.width / 3) { this.x = newX; this.updatePositionOnTerrain(); }
    }
    aim(angleChange) { this.angle += angleChange; this.angle = Math.max(5, Math.min(175, this.angle)); }
    getBarrelEnd() {
        const angleRad = this.angle * (Math.PI / 180); const pivotX = this.x; const pivotY = this.y + this.barrelPivotOffsetY;
        const endX = pivotX + this.barrelLength * Math.cos(angleRad); const endY = pivotY - this.barrelLength * Math.sin(angleRad); return { x: endX, y: endY };
    }

    takeDamage(amount) {
        if (this.health <= 0) return; // Already dead
        this.health -= amount;
        this.health = Math.max(0, this.health);
        this.hitFlashDuration = 0.3; // Trigger hit flash for 0.3 seconds
        if (this.isPlayer) playerHealthDisplay.textContent = this.health;
        else enemyHealthDisplay.textContent = this.health;
    }
}

class Projectile {
    // ... (constructor như trước) ...
    constructor(x, y, angle, power, ownerTank, ammoType = 'normal') {
        this.x = x; this.y = y; this.ownerTank = ownerTank; this.ammoType = ammoType;
        this.radius = ammoTypes[ammoType]?.radius || 5;
        const angleRad = angle * (Math.PI / 180); const initialSpeed = power * 0.19; // Slightly faster projectiles?
        this.vx = initialSpeed * Math.cos(angleRad); this.vy = -initialSpeed * Math.sin(angleRad);
        this.trailPoints = [{ x: this.x, y: this.y }]; this.maxTrailLength = 25; // Longer trail
        this.life = 8;
    }

    update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) return;
        this.vy += gravity * 10 * deltaTime; this.vx += windSpeed * 60 * deltaTime; // Wind affect
        this.x += this.vx * 60 * deltaTime; this.y += this.vy * 60 * deltaTime;
        // Smoother trail update
        const lastPoint = this.trailPoints[this.trailPoints.length - 1];
        const dx = this.x - lastPoint.x;
        const dy = this.y - lastPoint.y;
        if (dx * dx + dy * dy > 5 * 5) { // Only add point if moved enough
            this.trailPoints.push({ x: this.x, y: this.y });
            if (this.trailPoints.length > this.maxTrailLength) this.trailPoints.shift();
        } else { // Update last point if not moved enough
             this.trailPoints[this.trailPoints.length - 1] = { x: this.x, y: this.y };
        }
    }

    draw() {
        if (this.life <= 0) return;
        // Draw Trail (Smoother alpha fade)
        if (this.trailPoints.length > 1) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let i = 1; i < this.trailPoints.length; i++) {
                const alpha = Math.max(0.05, Math.min(0.6, (i / this.maxTrailLength) * (this.life / 3))); // Fade with length and life
                ctx.beginPath();
                ctx.moveTo(this.trailPoints[i-1].x, this.trailPoints[i-1].y);
                ctx.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
                ctx.strokeStyle = `rgba(255, 255, 220, ${alpha})`; // Creamy yellow
                ctx.lineWidth = this.radius * (0.4 + (i / this.maxTrailLength) * 0.6); // Tapered trail
                ctx.stroke();
            }
        }
        // Draw Projectile Head (Brighter)
        ctx.fillStyle = '#FFFF00'; // Bright yellow core
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; // Darker outline
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // ... (checkCollision như trước, trả về projectile: this) ...
    checkCollision() {
        if (this.life <= 0) return { collided: true, target: 'expired', projectile: this };
        const terrainY = getTerrainHeightAt(this.x);
        if (this.y + this.radius >= terrainY) return { collided: true, target: 'ground', x: this.x, y: terrainY, projectile: this };
        for (const wall of walls) { if (this.x > wall.x && this.x < wall.x + wall.width && this.y > wall.y && this.y < wall.y + wall.height) return { collided: true, target: wall, x: this.x, y: this.y, projectile: this }; }
        for (const tank of tanks) { if (tank !== this.ownerTank) { const tankLeft = tank.x - tank.width / 2; const tankRight = tank.x + tank.width / 2; const tankTop = tank.y - tank.height; const tankBottom = tank.y; if (this.x + this.radius > tankLeft && this.x - this.radius < tankRight && this.y + this.radius > tankTop && this.y - this.radius < tankBottom) return { collided: true, target: tank, x: this.x, y: this.y, projectile: this }; } }
        if (this.x < -this.radius * 10 || this.x > canvasWidth + this.radius * 10) return { collided: true, target: 'offscreen', projectile: this }; // Larger offscreen margin
        return { collided: false };
    }
}
class Wall { /* ... Giữ nguyên ... */
     constructor(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; this.color = '#8B4513'; } // Darker brown
     draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.strokeRect(this.x, this.y, this.width, this.height); }
}
class Particle {
    // ... (constructor như trước, thêm màu, tốc độ) ...
    constructor(x, y, options = {}) {
        this.x = x; this.y = y;
        const angle = options.angle ?? Math.random() * Math.PI * 2; // Allow specific angle
        const speed = options.speed ?? (1 + Math.random() * 6); // More speed variation
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed - Math.random() * 3; // More upward bias
        this.life = options.life ?? (0.5 + Math.random() * 1.0); // Longer average life
        this.radius = options.radius ?? (1 + Math.random() * 4);
        this.startRadius = this.radius; // Remember start size for fading
        this.baseColor = options.color ?? ['#FFA500', '#FF8C00', '#FF6347', '#FFD700', '#FF4500'][Math.floor(Math.random() * 5)]; // More color variety
        this.gravityFactor = 0.4 + Math.random() * 0.8; // Wider gravity variation
        this.alpha = 1.0;
        this.fadeSpeed = 1.5 / this.life; // Faster fade for shorter life
    }
    update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) return;
        this.vy += gravity * 7 * this.gravityFactor * deltaTime; // Stronger gravity feel
        // Air resistance (simple damping)
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.x += this.vx * 60 * deltaTime;
        this.y += this.vy * 60 * deltaTime;
        this.alpha = Math.max(0, this.life * this.fadeSpeed); // Fade based on remaining life
        this.radius = this.startRadius * Math.max(0, this.life / (this.startRadius / 3 + 0.1)); // Shrink based on life

        // Bounce off ground (simple)
        const terrainY = getTerrainHeightAt(this.x);
        if (this.y + this.radius > terrainY && this.vy > 0) {
             this.y = terrainY - this.radius;
             this.vy *= -0.4; // Lose energy on bounce
             this.vx *= 0.8; // Lose horizontal speed on bounce
        }
    }
    draw() {
        if (this.life <= 0 || this.radius < 0.5 || this.alpha <= 0) return;
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.baseColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        // Add a smaller, brighter core (optional)
        // ctx.fillStyle = 'white';
        // ctx.beginPath();
        // ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
        // ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}


// --- Game Logic Functions ---

function setupLevel(levelNum, loadedState = null) {
    // ... (phần đầu giữ nguyên: reset state, ammo, terrain) ...
    console.log(`Setting up Level ${levelNum}`);
    gameOver = false; projectile = null; secondaryProjectiles = []; particles = []; currentPlayer = 'player';
    turnDisplay.textContent = "Người Chơi"; levelDisplay.textContent = levelNum; currentPower = 50; powerDisplay.textContent = currentPower;
    playerAmmoCounts = loadedState?.playerAmmoCounts || { normal: Infinity, cluster: 3, heavy: 2 }; playerCurrentAmmo = 'normal';
    updateAmmoSelect(); generateTerrain();

    // --- Create tanks ---
    tanks = [ new Tank(150, 'blue', true, true), new Tank(canvasWidth - 150, 'red', false, false) ];
    // Apply loaded health or defaults
    if (loadedState) tanks[0].health = loadedState.playerHealth ?? 100; else tanks[0].health = 100;
    tanks[0].maxHealth = 100;
    const enemyMaxHealth = 100 + (levelNum - 1) * 30; // Enemy scales faster
    tanks[1].health = enemyMaxHealth; tanks[1].maxHealth = enemyMaxHealth;
    // Place tanks on terrain
    tanks.forEach(tank => tank.updatePositionOnTerrain());
    // Update health UI
    playerHealthDisplay.textContent = tanks[0].health; enemyHealthDisplay.textContent = tanks[1].health;

    // --- Create walls ---
    walls = []; const wallX = canvasWidth / 2 - 30; const wallBottomY = getTerrainHeightAt(wallX + 30);
    const wallHeight = 70 + Math.random() * 60; const wallTopY = Math.max(10, wallBottomY - wallHeight); // Ensure wall top isn't too high
    walls.push(new Wall(wallX, wallTopY, 60, wallBottomY - wallTopY));

    // --- Reset Polish/Other ---
    windChangeTimer = windChangeInterval; screenShakeDuration = 0;
    enableControls(); aiThinking = false;
    console.log("Level setup complete.");
}

function updateAmmoSelect() { /* ... Giữ nguyên ... */
    const currentSelection = ammoSelect.value; ammoSelect.innerHTML = ''; let foundSelected = false;
    for (const type in ammoTypes) { const count = playerAmmoCounts[type]; if (count > 0 || count === Infinity) { const option = document.createElement('option'); option.value = type; const countText = count === Infinity ? '(∞)' : `(${count})`; option.textContent = `${ammoTypes[type].name} ${countText}`; ammoSelect.appendChild(option); if (type === currentSelection) foundSelected = true; } }
    if (foundSelected && playerAmmoCounts[currentSelection] !== 0) { ammoSelect.value = currentSelection; playerCurrentAmmo = currentSelection; } else { ammoSelect.value = 'normal'; playerCurrentAmmo = 'normal'; } // Default to normal if selected is empty or unavailable
    updateAmmoCountDisplay();
}
function updateAmmoCountDisplay() { /* ... Giữ nguyên ... */
    const count = playerAmmoCounts[playerCurrentAmmo]; ammoCountDisplay.textContent = count === Infinity ? '∞' : count;
}


// --- Drawing Functions ---
function draw() {
    if (!assetsFullyLoaded) return; // Wait for asset loading attempt

    ctx.save(); // Save clean state

    // Apply screen shake
    if (screenShakeDuration > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeIntensity * 2;
        const shakeY = (Math.random() - 0.5) * screenShakeIntensity * 2;
        ctx.translate(shakeX, shakeY);
    }

    // 1. Draw Background (with fallback)
    ctx.clearRect(-canvasWidth, -canvasHeight, canvasWidth * 2, canvasHeight * 2); // Clear wider area due to shake
    if (imgBackground) {
        ctx.drawImage(imgBackground, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        // Log warning only once
        if (!window.loggedBgMissing) { console.warn("Background image missing..."); window.loggedBgMissing = true; }
    }

    // 2. Draw Terrain
    ctx.fillStyle = '#6B8E23'; // Olive Drab
    ctx.strokeStyle = '#556B2F'; // Dark Olive Green
    ctx.lineWidth = 1;
    if (terrainHeights.length > 0) {
        ctx.beginPath(); ctx.moveTo(0, canvasHeight); ctx.lineTo(0, terrainHeights[0]);
        for (let i = 1; i < terrainHeights.length; i++) ctx.lineTo(i * terrainResolution, terrainHeights[i]);
        ctx.lineTo(canvasWidth, terrainHeights[terrainHeights.length - 1]); ctx.lineTo(canvasWidth, canvasHeight);
        ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // 3. Draw Walls
    walls.forEach(wall => wall.draw());

    // 4. Draw Tanks
    tanks.forEach(tank => tank.draw());

    // 5. Draw Secondary Projectiles
    secondaryProjectiles.forEach(sp => sp.draw());

    // 6. Draw Main Projectile
    if (projectile) projectile.draw();

    // 7. Draw Trajectory Preview (Player only)
    if (currentPlayer === 'player' && !projectile && !gameOver) {
        drawTrajectoryPreview();
    }

    // 8. Draw Particles
    particles.forEach(p => p.draw());

    ctx.restore(); // Restore from screen shake
}

function drawTrajectoryPreview() {
    const playerTank = tanks.find(t => t.isPlayer);
    if (!playerTank) return;

    const startPos = playerTank.getBarrelEnd();
    let simX = startPos.x;
    let simY = startPos.y;

    const angleRad = playerTank.angle * (Math.PI / 180);
    const initialSpeed = currentPower * 0.19; // Match projectile speed
    let simVx = initialSpeed * Math.cos(angleRad);
    let simVy = -initialSpeed * Math.sin(angleRad);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // White translucent dots

    for (let i = 0; i < TRAJECTORY_STEPS; i++) {
        // Simulate physics step (simplified for preview)
        simVy += gravity * 10 * TRAJECTORY_STEP_TIME;
        simVx += windSpeed * 60 * TRAJECTORY_STEP_TIME; // Include wind
        simX += simVx * 60 * TRAJECTORY_STEP_TIME;
        simY += simVy * 60 * TRAJECTORY_STEP_TIME;

        // Draw dot every few steps
        if (i % 3 === 0) {
            ctx.beginPath();
            ctx.arc(simX, simY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Stop preview if it hits terrain (basic check)
        if (simY >= getTerrainHeightAt(simX)) {
            break;
        }
        // Stop if out of bounds
        if (simX < 0 || simX > canvasWidth) {
             break;
        }
    }
}


// --- Update Function ---
function update(deltaTime) {
    if (gameOver || !assetsFullyLoaded) return;

    // Update Screen Shake
    if (screenShakeDuration > 0) {
        screenShakeDuration -= deltaTime;
        screenShakeIntensity *= 0.9; // Dampen shake
    } else {
        screenShakeIntensity = 0;
    }

    // Update Wind
    windChangeTimer += deltaTime * 1000;
    if (windChangeTimer >= windChangeInterval) { /* ... (Giữ nguyên logic đổi gió) ... */
        windChangeTimer = 0; windSpeed = (Math.random() - 0.5) * 0.18; // Slightly stronger max wind
        if (Math.abs(windSpeed) < 0.02) windSpeed = 0.02 * Math.sign(windSpeed || 1);
        updateWindDisplay();
    }


    // Update Tanks (for effects like hit flash)
    tanks.forEach(tank => tank.update(deltaTime));

    // Update Main Projectile & Check Collision
    let mainProjectileCollidedThisFrame = false;
    if (projectile) {
        projectile.update(deltaTime);
        const collision = projectile.checkCollision();
        if (collision.collided) {
            handleCollision(collision); // Handle collision FIRST
            mainProjectileCollidedThisFrame = true; // Mark as done
            // projectile = null; // handleCollision now sets projectile = null if needed
        }
    }

    // Update Secondary Projectiles & Check Collision
    for (let i = secondaryProjectiles.length - 1; i >= 0; i--) {
        secondaryProjectiles[i].update(deltaTime);
        const collision = secondaryProjectiles[i].checkCollision();
        if (collision.collided) {
             handleCollision(collision);
             secondaryProjectiles.splice(i, 1);
        } else if(secondaryProjectiles[i].life <= 0) {
             secondaryProjectiles.splice(i, 1);
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) { /* ... (Giữ nguyên) ... */
        particles[i].update(deltaTime); if (particles[i].life <= 0 || particles[i].radius < 0.5) particles.splice(i, 1);
    }

    // --- Turn Switching Logic ---
    // Switch turn only if the main projectile collided *this frame* OR if it's null
    // AND there are no secondary projectiles left.
    if ((mainProjectileCollidedThisFrame || !projectile) && secondaryProjectiles.length === 0 && !aiThinking && currentPlayer === 'player') {
         // If player's turn just ended (main projectile done)
         setTimeout(switchTurn, 500); // Delay switch
    } else if (currentPlayer === 'enemy' && !projectile && secondaryProjectiles.length === 0 && !aiThinking) {
         // If it's enemy's turn and ready for AI
        aiThinking = true;
        setTimeout(enemyAI, 1000 + Math.random() * 1000); // AI delay
    }
}


// --- Collision Handling ---
function handleCollision(collision) {
    const { target, x, y, projectile: proj } = collision;
    if (!proj) return;

    const currentAmmoData = ammoTypes[proj.ammoType];
    const damageRange = currentAmmoData.damage;
    const damage = damageRange[0] + Math.floor(Math.random() * (damageRange[1] - damageRange[0] + 1));

    playSound('explode');

    // --- Create Particles ---
    const numParticles = 25 + Math.floor(Math.random() * 30); // More particles
    let baseColor = null;
    let particleSpeed = 6;
    let particleLife = 1.2;

    if (target instanceof Tank) {
        baseColor = '#FF4500'; // Red/Orange for tank hit
        particleSpeed = 7;
        particleLife = 1.5;
        target.takeDamage(damage); // Apply damage
        triggerScreenShake(5, 0.3); // Trigger stronger shake for tank hit
        checkWinCondition(); // Check win AFTER applying damage
    } else if (target === 'ground') {
        baseColor = '#A0522D'; // Brown/Dirt color for ground hit
        particleSpeed = 4;
        particleLife = 1.0;
        if (currentAmmoData.effect === 'heavy_impact') {
            modifyTerrain(x, 40 + Math.random()*15, 20 + Math.random()*10); // Bigger crater
            triggerScreenShake(3, 0.2); // Smaller shake for ground hit
        }
    } else if (target instanceof Wall) {
         baseColor = '#888888'; // Grey for wall hit
         particleSpeed = 3;
         particleLife = 0.8;
         triggerScreenShake(2, 0.15);
    }

    // Create particles with variations
    for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle(x, y, {
             color: baseColor, // Use determined color or default random
             speed: particleSpeed * (0.5 + Math.random()), // Vary speed
             life: particleLife * (0.7 + Math.random() * 0.6) // Vary life
        }));
    }

    // Handle cluster effect (only for main projectile)
    if (currentAmmoData.effect === 'cluster' && proj === projectile) {
        createClusterBombs(x, y, currentAmmoData.count, currentAmmoData.spread, proj.ownerTank);
    }

    // Nullify the projectile that caused the collision
    if (proj === projectile) {
        projectile = null;
    }
    // Secondary projectiles are handled by splice in update loop
}

// --- Helper Functions (createClusterBombs, updateWindDisplay, switchTurn, enemyAI, calculateOptimalAngle_Basic, fire, checkWinCondition, save/loadGameState, disable/enableControls) ---
// *** GIỮ NGUYÊN HẦU HẾT CÁC HÀM NÀY TỪ PHIÊN BẢN TRƯỚC ***
// (Chỉ cần đảm bảo chúng hoạt động với logic mới nếu cần)
function createClusterBombs(x, y, count, spreadAngle, ownerTank) { /* ... Giữ nguyên ... */
    console.log(`Creating ${count} cluster bombs`); for (let i = 0; i < count; i++) { const angleOffset = (Math.random() - 0.5) * spreadAngle; const initialAngle = 270 + angleOffset + (Math.random() - 0.5) * 30; const initialPower = 15 + Math.random() * 15; const bomb = new Projectile(x, y + 5, initialAngle, initialPower, ownerTank, 'normal'); bomb.life = 1.5 + Math.random(); secondaryProjectiles.push(bomb); }
}
function updateWindDisplay() { /* ... Giữ nguyên ... */
    let direction = ''; let strength = ''; const absWind = Math.abs(windSpeed);
    if (absWind < 0.015) { direction = '--'; strength = 'Không'; } else { direction = windSpeed > 0 ? '→' : '←'; if (absWind < 0.06) strength = 'Nhẹ'; else if (absWind < 0.11) strength = 'Vừa'; else strength = 'Mạnh'; }
    windInfoDisplay.innerHTML = `${direction} ${strength}`;
}
function switchTurn() {
    if (gameOver) return; if (projectile || secondaryProjectiles.length > 0) { console.log("Deferring turn switch, projectiles still active."); return; } // Double check projectiles
    if (currentPlayer === 'player') { currentPlayer = 'enemy'; turnDisplay.textContent = "Đối Phương"; disableControls(); }
    else { currentPlayer = 'player'; turnDisplay.textContent = "Người Chơi"; enableControls(); aiThinking = false; }
}
function enemyAI() { /* ... Giữ nguyên AI cơ bản ... */
    if (currentPlayer !== 'enemy' || projectile || secondaryProjectiles.length > 0 || gameOver) { aiThinking = false; return; }
    const enemy = tanks.find(t => !t.isPlayer); const player = tanks.find(t => t.isPlayer); if(!enemy || !player) { aiThinking = false; return; }
    const targetX = player.x + (Math.random() - 0.5) * player.width * 0.3; const targetY = player.y - player.height / 2;
    const dx = targetX - enemy.x; const dy = enemy.y - targetY; const distance = Math.sqrt(dx * dx + dy * dy);
    let firePower = Math.max(minPower, Math.min(maxPower, 35 + distance * 0.12)); let targetAngle = calculateOptimalAngle_Basic(enemy, targetX, targetY, firePower);
    const maxAngleError = 25 / (level + 1.5); const angleError = (Math.random() - 0.5) * maxAngleError; targetAngle += angleError; // Reduce error slightly faster
    const maxPowerError = 20 / (level + 1.5); firePower += (Math.random() - 0.5) * maxPowerError; firePower = Math.max(minPower, Math.min(maxPower, firePower));
    enemy.angle = Math.max(5, Math.min(175, targetAngle)); console.log(`AI [Lvl ${level}] Aim: A=${enemy.angle.toFixed(1)} P=${firePower.toFixed(1)}`);
    if (currentPlayer === 'enemy' && !projectile && !gameOver) { fire(enemy, firePower); } aiThinking = false; // Reset thinking flag AFTER firing attempt
}
function calculateOptimalAngle_Basic(tank, targetX, targetY, power) { /* ... Giữ nguyên hàm tính cơ bản ... */
    const dx = targetX - tank.x; const dy = tank.y - targetY; let angle = Math.atan2(dy, dx) * (180 / Math.PI); const distance = Math.sqrt(dx*dx + dy*dy); angle += distance / (power * 0.6 + 15); return angle;
}
function fire(tank, power) { /* ... Giữ nguyên logic kiểm tra đạn và gọi new Projectile ... */
    if (projectile || secondaryProjectiles.length > 0) return;
    const ammoTypeKey = tank.isPlayer ? playerCurrentAmmo : enemyCurrentAmmo; const ammoData = ammoTypes[ammoTypeKey];
    if (tank.isPlayer) { const currentCount = playerAmmoCounts[ammoTypeKey]; if (currentCount === 0) { playSound('empty'); return; } if (currentCount !== Infinity) { playerAmmoCounts[ammoTypeKey]--; updateAmmoCountDisplay(); if (playerAmmoCounts[ammoTypeKey] === 0 && ammoTypeKey !== 'normal') { updateAmmoSelect(); if(ammoSelect.value === ammoTypeKey) { playerCurrentAmmo = 'normal'; ammoSelect.value = 'normal'; updateAmmoCountDisplay(); } } } }
    const barrelEnd = tank.getBarrelEnd(); projectile = new Projectile(barrelEnd.x, barrelEnd.y, tank.angle, power, tank, ammoTypeKey); playSound('fire'); if (tank.isPlayer) disableControls();
}
function checkWinCondition() { /* ... Giữ nguyên logic kiểm tra thắng/thua, gọi save/load/setupLevel ... */
    if (gameOver) return; const player = tanks.find(t => t.isPlayer); const enemy = tanks.find(t => !t.isPlayer); if(!player || !enemy) return; let gameEnded = false; let message = "";
    if (enemy.health <= 0) { message = `Chúc mừng! Bạn đã qua Level ${level}!`; gameEnded = true; saveGameState(); level++; }
    else if (player.health <= 0) { message = `Game Over! Bạn đã thua ở Level ${level}. Chơi lại từ Level 1.`; gameEnded = true; level = 1; localStorage.removeItem('tankDuelSaveData_v1'); }
    if (gameEnded) { gameOver = true; disableControls(); console.log(message); setTimeout(() => { alert(message); const stateToLoad = player.health > 0 ? loadGameState() : null; setupLevel(level, stateToLoad); }, 1500); }
}
function saveGameState() { /* ... Giữ nguyên ... */
    const player = tanks.find(t => t.isPlayer); if (gameOver && player?.health <= 0) return; const state = { level: level, playerHealth: player ? player.health : 100, playerAmmoCounts: playerAmmoCounts, }; try { localStorage.setItem('tankDuelSaveData_v1', JSON.stringify(state)); console.log("Game state saved:", state); } catch (e) { console.error("Could not save game state:", e); }
}
function loadGameState() { /* ... Giữ nguyên ... */
    try { const savedData = localStorage.getItem('tankDuelSaveData_v1'); if (savedData) { const state = JSON.parse(savedData); console.log("Loaded game state:", state); if (typeof state.level === 'number' && state.level > 0) { level = state.level; return state; } } } catch (e) { console.error("Could not load/parse game state:", e); localStorage.removeItem('tankDuelSaveData_v1'); } level = 1; return null;
}
function disableControls() { btnMoveLeft.disabled = true; btnMoveRight.disabled = true; btnAngleUp.disabled = true; btnAngleDown.disabled = true; btnPowerUp.disabled = true; btnPowerDown.disabled = true; btnFire.disabled = true; ammoSelect.disabled = true; }
function enableControls() { if (gameOver) { disableControls(); return; } if (currentPlayer === 'player') { btnMoveLeft.disabled = false; btnMoveRight.disabled = false; btnAngleUp.disabled = false; btnAngleDown.disabled = false; btnPowerUp.disabled = false; btnPowerDown.disabled = false; btnFire.disabled = false; ammoSelect.disabled = false; } else { disableControls(); } }

// --- Polish Helper Functions ---
function triggerScreenShake(intensity, duration) {
    screenShakeIntensity = Math.max(screenShakeIntensity, intensity); // Don't override stronger shake
    screenShakeDuration = Math.max(screenShakeDuration, duration); // Extend duration if needed
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // ... (Giữ nguyên addSafeListener và các listener khác từ phiên bản trước) ...
    const addSafeListener = (element, eventType, handler) => {
        if (element) {
             const eventOptions = (eventType === 'touchstart' || eventType === 'touchmove') ? { passive: false } : undefined; // Need passive:false for preventDefault on touch
             element.removeEventListener(eventType, handler); // Remove old first (safer)
             element.addEventListener(eventType, handler, eventOptions);
             if (element.tagName === 'BUTTON' && eventType === 'click' && 'ontouchstart' in window) {
                 const touchHandler = (e) => { e.preventDefault(); handler(e); element.style.transition = 'transform 0.05s ease-out'; element.style.transform = 'scale(0.95)'; setTimeout(() => element.style.transform = 'scale(1)', 80); };
                 element.removeEventListener('touchstart', touchHandler); // Remove old first
                 element.addEventListener('touchstart', touchHandler, { passive: false });
             }
        } else { console.warn(`Element not found for listener: ${element}`); }
    };
    addSafeListener(btnMoveLeft, 'click', () => { if (!btnMoveLeft.disabled) tanks[0].move(-1, 1 / 10); });
    addSafeListener(btnMoveRight, 'click', () => { if (!btnMoveRight.disabled) tanks[0].move(1, 1 / 10); });
    addSafeListener(btnAngleUp, 'click', () => { if (!btnAngleUp.disabled) tanks[0].aim(2); });
    addSafeListener(btnAngleDown, 'click', () => { if (!btnAngleDown.disabled) tanks[0].aim(-2); });
    addSafeListener(btnPowerUp, 'click', () => { if (!btnPowerUp.disabled) { currentPower = Math.min(maxPower, currentPower + 5); powerDisplay.textContent = currentPower; } });
    addSafeListener(btnPowerDown, 'click', () => { if (!btnPowerDown.disabled) { currentPower = Math.max(minPower, currentPower - 5); powerDisplay.textContent = currentPower; } });
    addSafeListener(btnFire, 'click', () => { if (!btnFire.disabled) fire(tanks[0], currentPower); });
    addSafeListener(ammoSelect, 'change', (e) => { playerCurrentAmmo = e.target.value; updateAmmoCountDisplay(); });
    addSafeListener(btnToggleMusic, 'click', toggleMusic);

    // --- User Interaction Listener for Audio (giữ nguyên) ---
    const handleFirstInteraction = () => {
        if (!userInteracted) {
            console.log("User interaction detected."); userInteracted = true;
            if (window.tryLoadAudioDeferred) window.tryLoadAudioDeferred(); // Call the deferred audio loader
            document.removeEventListener('click', handleFirstInteraction); document.removeEventListener('touchstart', handleFirstInteraction); document.removeEventListener('keydown', handleFirstInteraction);
        }
    };
    document.addEventListener('click', handleFirstInteraction, { once: true });
    document.addEventListener('touchstart', handleFirstInteraction, { once: true });
    document.addEventListener('keydown', handleFirstInteraction, { once: true });
}

// --- Game Loop ---
function gameLoop(currentTime) {
    const now = performance.now();
    const deltaTime = lastTime === 0 ? (1 / 60) : Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Chỉ update và draw nếu quá trình load asset *đã bắt đầu và hoàn tất kiểm tra*
    if (assetsFullyLoaded) {
        update(deltaTime);
        draw();
    }

    requestAnimationFrame(gameLoop);
}

// --- Start Game ---
function startGameLogic() {
    console.log("Starting Game Logic...");
    setupEventListeners();
    const loadedState = loadGameState();
    setupLevel(level, loadedState); // Use global level updated by loadGameState
    updateWindDisplay();
    lastTime = performance.now(); // Initialize lastTime *before* first gameLoop call
    requestAnimationFrame(gameLoop);
}

// --- Initial Load ---
console.log("Document Loaded. Initializing asset loading...");
loadAssets(); // Start loading assets
