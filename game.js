// --- Strict Mode ---
"use strict";

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
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

// --- Error Handling ---
// Function to display errors more visibly (optional)
function displayError(message) {
    console.error(message);
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        const errorElement = document.createElement('p');
        errorElement.textContent = `LỖI: ${message}`;
        errorElement.style.color = 'red';
        errorElement.style.fontSize = '0.8em';
        errorElement.style.marginTop = '10px';
        loadingScreen.appendChild(errorElement);
    }
    // alert(`Lỗi: ${message}`); // Use alert for critical errors if needed
}

// --- Game Constants ---
const canvasWidth = 1000;
const canvasHeight = 600;
if (canvas) { // Ensure canvas exists before setting size
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
} else {
    displayError("Không tìm thấy canvas element!");
}
const gravity = 0.16;
const terrainResolution = 5;
const maxPower = 100;
const minPower = 10;
const windChangeInterval = 7000;
const TRAJECTORY_STEPS = 45;
const TRAJECTORY_STEP_TIME = 0.08;

// --- Game State ---
let level = 1;
let currentPlayer = 'player';
let projectile = null;
let secondaryProjectiles = [];
let particles = [];
let tanks = [];
let walls = [];
let terrainHeights = [];
let gameOver = false;
let gamePaused = false;
let currentPower = 50;
let windSpeed = 0;
let windChangeTimer = 0;
let lastTime = 0;
let assetsFullyChecked = false; // Renamed for clarity
let aiThinking = false;
let userInteracted = false;

// --- Polish State ---
let screenShakeIntensity = 0;
let screenShakeDuration = 0;
const MAX_SCREEN_SHAKE = 8;

// --- Ammo Data ---
const ammoTypes = {
    normal: { name: "Thường", damage: [25, 35], effect: null, radius: 5 },
    cluster: { name: "Chùm", damage: [10, 15], count: 4, spread: 45, effect: 'cluster', radius: 5 },
    heavy: { name: "Nặng", damage: [40, 55], effect: 'heavy_impact', radius: 7, shake: 4 },
};
let playerCurrentAmmo = 'normal';
let playerAmmoCounts = { normal: Infinity, cluster: 3, heavy: 2 };
let enemyCurrentAmmo = 'normal';

// --- Asset Variables & Loading Status ---
let imgTankBlue, imgTankRed, imgBarrel, imgBackground, imgExplosionSheet;
let audioContext;
let soundBuffers = {};
let musicSource = null;
let isMusicPlaying = false;
let loadedAssetStatus = {}; // Stores 'loading', 'loaded', 'error', 'deferred'

// --- Asset Loading ---
function loadImage(src) {
    loadedAssetStatus[src] = 'loading';
    return new Promise((resolve, reject) => {
        if (!src) { // Handle cases where src might be undefined/null
            loadedAssetStatus[src || 'unknown_image'] = 'error';
            console.error("ERROR: Attempted to load image with null/undefined source.");
            reject(new Error("Null/undefined image source"));
            return;
        }
        const img = new Image();
        img.onload = () => { loadedAssetStatus[src] = 'loaded'; resolve(img); };
        img.onerror = (err) => { loadedAssetStatus[src] = 'error'; console.error(`ERROR: Failed Image: ${src}`, err); reject(new Error(`Failed Image: ${src}`)); };
        img.src = src;
    });
}

function initAudio() {
    if (!userInteracted) { /*console.log("AudioContext deferred.");*/ return false; }
    if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`AudioContext state: ${audioContext.state}`);
            if (audioContext.state === 'suspended') { audioContext.resume().then(() => console.log('AudioContext resumed.')).catch(e => console.error('Error resuming AC:', e)); }
            return true;
        } catch (e) { console.error("Web Audio API init failed.", e); return false; }
    } else if (!audioContext) { console.warn("Web Audio API not supported."); return false; }
    if (audioContext.state === 'suspended') { audioContext.resume().catch(e => console.error('Error resuming existing AC:', e)); }
    return audioContext.state === 'running';
}

function loadAudio(url) {
    if (!audioContext || audioContext.state !== 'running') { loadedAssetStatus[url] = 'deferred'; return Promise.resolve(null); }
    loadedAssetStatus[url] = 'loading';
    return fetch(url)
        .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`); return response.arrayBuffer(); })
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(decodedBuffer => { loadedAssetStatus[url] = 'loaded'; return decodedBuffer; })
        .catch(error => { loadedAssetStatus[url] = 'error'; console.error(`ERROR: Failed Audio: ${url}:`, error); return null; });
}

// --- Load All Assets (Robust version) ---
async function loadAssets() {
    console.log("Starting asset loading...");
    if (loadingScreen) loadingScreen.classList.remove('hidden'); // Show loading

    // *** KIỂM TRA LẠI DANH SÁCH VÀ ĐƯỜNG DẪN FILE CỦA BẠN Ở ĐÂY ***
    const assetsToLoad = [
        { type: 'image', src: 'assets/images/tank_blue.png', target: 'imgTankBlue' },
        { type: 'image', src: 'assets/images/tank_red.png', target: 'imgTankRed' },
        { type: 'image', src: 'assets/images/barrel.png', target: 'imgBarrel' },
        { type: 'image', src: 'assets/images/background.png', target: 'imgBackground' },
        { type: 'image', src: 'assets/images/explosion_spritesheet.png', target: 'imgExplosionSheet' },
        { type: 'audio', src: 'assets/sounds/fire.wav', target: 'fire' },
        { type: 'audio', src: 'assets/sounds/explode.wav', target: 'explode' },
        { type: 'audio', src: 'assets/sounds/music.wav', target: 'music' }, // Đảm bảo đúng đuôi file nhạc
        { type: 'audio', src: 'assets/sounds/empty_click.wav', target: 'empty' }
    ];
    // *** KẾT THÚC PHẦN KIỂM TRA ***

    // Store the deferred audio loading function globally
    window.tryLoadAudioDeferred = async () => {
        if (!initAudio()) { console.warn("Cannot load audio: Context not ready."); return; }
        console.log("Attempting deferred audio loading...");
        const audioAssets = assetsToLoad.filter(a => a.type === 'audio' && loadedAssetStatus[a.src] === 'deferred');
        if (audioAssets.length === 0) { console.log("No deferred audio to load."); return; }
        const audioLoadPromises = audioAssets.map(asset => loadAudio(asset.src).then(buffer => ({ target: asset.target, data: buffer, src: asset.src })));
        const audioResults = await Promise.allSettled(audioLoadPromises);
        audioResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value?.data) { soundBuffers[result.value.target] = result.value.data; console.log(`Deferred Loaded Audio: ${result.value.src}`); }
            else if (result.status === 'rejected') { console.error(`Deferred Failed Audio: ${result.reason?.message || 'Unknown Audio'}`); }
        });
        console.log("Deferred audio loading attempt finished.");
    };

    const imagePromises = assetsToLoad.filter(a => a.type === 'image').map(asset =>
        loadImage(asset.src).then(img => ({ target: asset.target, data: img, src: asset.src }))
                          .catch(error => ({ target: asset.target, reason: error, src: asset.src, status: 'rejected' })) // Pass src on error
    );

    console.log("Waiting for image promises...");
    const imageResults = await Promise.allSettled(imagePromises);
    let allImagesLoadedOK = true;
    imageResults.forEach(result => {
        // Find the original asset config to get the target variable name
        const originalAsset = assetsToLoad.find(a => a.src === result.value?.src || a.src === result.reason?.src);
        const targetVar = originalAsset?.target;

        if (result.status === 'fulfilled' && result.value?.data) {
            if (targetVar) window[targetVar] = result.value.data; // Assign to global var
            else console.warn(`Could not find target variable for loaded image: ${result.value?.src}`);
            console.log(`Loaded: ${result.value.src}`);
        } else if (result.status === 'rejected') {
            allImagesLoadedOK = false;
            if (targetVar) window[targetVar] = null; // Assign null to failed image var
            else console.warn(`Could not find target variable for failed image: ${result.reason?.src}`);
             displayError(`Không tải được ảnh: ${result.reason?.src || 'Không rõ'}`); // Show error on loading screen
            console.error(`Failed Image: ${result.reason?.src || 'Unknown Image'} - Reason:`, result.reason?.reason || result.reason);
        }
    });
    console.log(`Image loading finished. All OK: ${allImagesLoadedOK}`);

    assetsFullyChecked = true; // Mark that the check process is done
    console.log("Asset check complete. Starting game logic.");
    if (loadingScreen) loadingScreen.classList.add('hidden');
    startGameLogic(); // Start game logic regardless of asset errors

    if (userInteracted) window.tryLoadAudioDeferred();
    else console.log("Audio loading deferred until user interaction.");
}

// --- Sound Playback & Music Toggle ---
function playSound(bufferName, volume = 1.0) {
    if (!audioContext || audioContext.state !== 'running' || !soundBuffers[bufferName]) return;
    try { const source = audioContext.createBufferSource(); source.buffer = soundBuffers[bufferName]; const gainNode = audioContext.createGain(); gainNode.gain.setValueAtTime(volume, audioContext.currentTime); source.connect(gainNode).connect(audioContext.destination); source.start(0); } catch (e) { console.error(`Error playing sound ${bufferName}:`, e); }
}
function toggleMusic() {
    if (!initAudio()) { console.warn("Cannot toggle music - AC not ready."); return; } if (!soundBuffers.music) { console.log("Cannot toggle music - buffer missing."); return; }
    if (isMusicPlaying) { if (musicSource) { try { musicSource.stop(); musicSource.disconnect(); } catch(e){} } isMusicPlaying = false; btnToggleMusic.textContent = "🎵 Tắt"; btnToggleMusic.classList.remove('playing'); }
    else { musicSource = audioContext.createBufferSource(); musicSource.buffer = soundBuffers.music; musicSource.loop = true; const gainNode = audioContext.createGain(); gainNode.gain.setValueAtTime(0.25, audioContext.currentTime); musicSource.connect(gainNode).connect(audioContext.destination); try { musicSource.start(0); isMusicPlaying = true; btnToggleMusic.textContent = "🎵 Bật"; btnToggleMusic.classList.add('playing'); } catch(e) { console.error("Error starting music:", e); isMusicPlaying = false; } }
}

// --- Terrain Functions ---
// *** GIỮ NGUYÊN ***
function generateTerrain() { terrainHeights = []; let cH = canvasHeight*(0.6+Math.random()*0.2); for(let x=0; x<=canvasWidth; x+=terrainResolution){ terrainHeights.push(cH); let dH=(Math.random()-0.48)*12; cH+=dH; cH=Math.max(canvasHeight*0.3, Math.min(canvasHeight-40, cH)); } if(terrainHeights.length*terrainResolution<canvasWidth+terrainResolution) terrainHeights.push(cH); smoothTerrain(2); }
function smoothTerrain(p) { if(terrainHeights.length<3)return; for(let i=0;i<p;i++){ let s=[terrainHeights[0]]; for(let j=1;j<terrainHeights.length-1;j++)s.push((terrainHeights[j-1]+terrainHeights[j]*1.5+terrainHeights[j+1])/3.5); s.push(terrainHeights[terrainHeights.length-1]); terrainHeights=s; }}
function getTerrainHeightAt(x){ if(!terrainHeights||terrainHeights.length===0)return canvasHeight-50; x=Math.max(0,Math.min(canvasWidth,x)); const idx=Math.floor(x/terrainResolution); const nIdx=Math.min(idx+1,terrainHeights.length-1); if(idx>=terrainHeights.length-1||idx<0)return terrainHeights[terrainHeights.length-1]||canvasHeight-50; const x1=idx*terrainResolution;const y1=terrainHeights[idx]; const x2=nIdx*terrainResolution;const y2=terrainHeights[nIdx]; if(x2===x1)return y1; const t=(x-x1)/(x2-x1); return y1+(y2-y1)*t; }
function modifyTerrain(iX,r,d){ if(!terrainHeights||terrainHeights.length===0)return; const sIdx=Math.max(0,Math.floor((iX-r)/terrainResolution)); const eIdx=Math.min(terrainHeights.length-1,Math.ceil((iX+r)/terrainResolution)); for(let i=sIdx;i<=eIdx;i++){ const cX=i*terrainResolution; const dFI=Math.abs(cX-iX); if(dFI<r){ const cdf=(Math.cos((dFI/r)*Math.PI)+1)/2; terrainHeights[i]+=d*cdf; terrainHeights[i]=Math.min(canvasHeight+50,terrainHeights[i]); }}}

// --- Classes (Tank, Projectile, Wall, Particle) ---
// *** GIỮ NGUYÊN *** (Đã bao gồm fallback drawing, hit flash, trails, particles)
class Tank {
    constructor(x,c,fR=true,iP=false){ this.x=x; this.y=canvasHeight-50; this.width=70; this.height=40; this.bOffsetY=-this.height*0.4; this.bLen=35; this.angle=fR?45:135; this.color=c; this.health=100; this.maxHealth=100; this.fR=fR; this.isP=iP; this.img=iP?imgTankBlue:imgTankRed; this.bImg=imgBarrel; this.spd=150; this.hitT=0; }
    updTerra(){ this.y=getTerrainHeightAt(this.x); }
    upd(dt){ if(this.hitT>0)this.hitT-=dt; }
    draw(){ ctx.save(); if(this.hitT>0){ const fA=Math.sin(this.hitT*Math.PI*6)*0.5+0.5; ctx.filter=`brightness(${1+fA*1.2}) saturate(1.5)`; } const dX=this.x-this.width/2; const dY=this.y-this.height; if(!this.img){ ctx.fillStyle=this.isP?'#007bff':'#dc3545'; ctx.fillRect(dX,dY,this.width,this.height); if(!window.loggedTankMissing){console.warn(`Tank image missing for ${this.isP?'player':'enemy'}. Draw fallback.`); window.loggedTankMissing=true;} } else { try {ctx.drawImage(this.img,dX,dY,this.width,this.height);} catch(e){console.error("Draw tank img error:",e,this.img); ctx.fillStyle=this.isP?'#007bff':'#dc3545'; ctx.fillRect(dX,dY,this.width,this.height);}} const aR=this.angle*Math.PI/180; const pX=this.x; const pY=this.y+this.bOffsetY; ctx.save(); ctx.translate(pX,pY); ctx.rotate(-aR); if(this.bImg){ const bW=45;const bH=12; try{ctx.drawImage(this.bImg,0,-bH/2,bW,bH);} catch(e){console.error("Draw barrel img error:",e,this.bImg); ctx.fillStyle='grey';ctx.fillRect(0,-3,this.bLen,6);}} else{ ctx.fillStyle='grey'; ctx.fillRect(0,-3,this.bLen,6); if(!window.loggedBarrelMissing){console.warn("Barrel image missing. Draw fallback."); window.loggedBarrelMissing=true;}} ctx.restore(); ctx.restore(); const hbY=dY-10; this.drawHB(hbY); }
    drawHB(yP){ const bW=this.width*0.8; const bH=6; const bX=this.x-bW/2; const hP=Math.max(0,this.health/this.maxHealth); ctx.fillStyle='#555'; ctx.fillRect(bX,yP,bW,bH); ctx.fillStyle=hP>0.5?'#28a745':(hP>0.2?'#ffc107':'#dc3545'); ctx.fillRect(bX,yP,bW*hP,bH); ctx.strokeStyle='black'; ctx.lineWidth=1; ctx.strokeRect(bX,yP,bW,bH); }
    move(dir,dt){ const mA=dir*this.spd*dt; const nX=this.x+mA; if(nX>this.width/3&&nX<canvasWidth-this.width/3){ this.x=nX; this.updTerra(); }}
    aim(dAng){ this.angle+=dAng; this.angle=Math.max(5,Math.min(175,this.angle)); }
    getBEnd(){ const aR=this.angle*Math.PI/180; const pX=this.x; const pY=this.y+this.bOffsetY; const eX=pX+this.bLen*Math.cos(aR); const eY=pY-this.bLen*Math.sin(aR); return{x:eX,y:eY}; }
    takeDmg(amt){ if(this.health<=0)return; this.health-=amt; this.health=Math.max(0,this.health); this.hitT=0.35; if(this.isP)playerHealthDisplay.textContent=this.health; else enemyHealthDisplay.textContent=this.health; }
}
class Projectile {
    constructor(x,y,a,p,oT,aT='normal'){ this.x=x;this.y=y;this.oT=oT;this.aT=aT;this.r=ammoTypes[aT]?.radius||5; const aR=a*Math.PI/180; const iS=p*0.19; this.vx=iS*Math.cos(aR);this.vy=-iS*Math.sin(aR); this.trail=[{x:this.x,y:this.y}];this.maxTrail=25;this.life=8;}
    upd(dt){ this.life-=dt; if(this.life<=0)return; this.vy+=gravity*10*dt; this.vx+=windSpeed*60*dt; this.x+=this.vx*60*dt; this.y+=this.vy*60*dt; const lP=this.trail[this.trail.length-1]; const dx=this.x-lP.x; const dy=this.y-lP.y; if(dx*dx+dy*dy>25){ this.trail.push({x:this.x,y:this.y}); if(this.trail.length>this.maxTrail)this.trail.shift(); } else this.trail[this.trail.length-1]={x:this.x,y:this.y}; }
    draw(){ if(this.life<=0)return; ctx.lineCap='round'; ctx.lineJoin='round'; for(let i=1; i<this.trail.length; i++){ const alpha=Math.max(0.05,Math.min(0.6,(i/this.maxTrail)*(this.life/2))); ctx.beginPath(); ctx.moveTo(this.trail[i-1].x,this.trail[i-1].y); ctx.lineTo(this.trail[i].x,this.trail[i].y); ctx.strokeStyle=`rgba(255,255,220,${alpha})`; ctx.lineWidth=this.r*(0.4+(i/this.maxTrail)*0.6); ctx.stroke(); } ctx.fillStyle='#FFFF00'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r*0.6,0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill(); }
    chkColl(){ if(this.life<=0)return{collided:true,target:'expired',projectile:this}; const tY=getTerrainHeightAt(this.x); if(this.y+this.r>=tY)return{collided:true,target:'ground',x:this.x,y:tY,projectile:this}; for(const w of walls){if(this.x>w.x&&this.x<w.x+w.width&&this.y>w.y&&this.y<w.y+w.height)return{collided:true,target:w,x:this.x,y:this.y,projectile:this};} for(const t of tanks){if(t!==this.oT){ const tL=t.x-t.width/2; const tR=t.x+t.width/2; const tT=t.y-t.height; const tB=t.y; if(this.x+this.r>tL&&this.x-this.r<tR&&this.y+this.r>tT&&this.y-this.r<tB)return{collided:true,target:t,x:this.x,y:this.y,projectile:this};}} if(this.x<-this.r*10||this.x>canvasWidth+this.r*10)return{collided:true,target:'offscreen',projectile:this}; return{collided:false};}
}
class Wall { constructor(x,y,w,h){this.x=x;this.y=y;this.width=w;this.height=h;this.color='#8B4513';} draw(){ctx.fillStyle=this.color;ctx.fillRect(this.x,this.y,this.width,this.height);ctx.strokeStyle='#444';ctx.lineWidth=2;ctx.strokeRect(this.x,this.y,this.width,this.height);} }
class Particle { constructor(x,y,o={}){this.x=x;this.y=y; const ang=o.angle??Math.random()*Math.PI*2; const spd=o.speed??(1+Math.random()*6); this.vx=Math.cos(ang)*spd;this.vy=Math.sin(ang)*spd-Math.random()*3; this.life=o.life??(0.5+Math.random()*1.0); this.r=o.radius??(1+Math.random()*4); this.sR=this.r; this.color=o.color??['#FFA500','#FF8C00','#FF6347','#FFD700','#FF4500'][Math.floor(Math.random()*5)]; this.gravF=0.4+Math.random()*0.8; this.alpha=1.0; this.fade=1.5/this.life;}
    upd(dt){ this.life-=dt; if(this.life<=0)return; this.vy+=gravity*7*this.gravF*dt; this.vx*=0.98; this.vy*=0.98; this.x+=this.vx*60*dt; this.y+=this.vy*60*dt; this.alpha=Math.max(0,this.life*this.fade); this.r=this.sR*Math.max(0,this.life/(this.sR/4+0.1)); const tY=getTerrainHeightAt(this.x); if(this.y+this.r>tY&&this.vy>0){ this.y=tY-this.r; this.vy*=-0.4; this.vx*=0.8; } }
    draw(){ if(this.life<=0||this.r<0.5||this.alpha<=0)return; ctx.globalAlpha=this.alpha; ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1.0; }
}

// --- Game Logic Functions ---
// *** GIỮ NGUYÊN: setupLevel, updateAmmoSelect, updateAmmoCountDisplay, draw, drawTrajectoryPreview, update, handleCollision, triggerScreenShake, createClusterBombs, updateWindDisplay, switchTurn, enemyAI, calculateOptimalAngle_Basic, fire, checkWinCondition, save/loadGameState, disable/enableControls ***
function setupLevel(levelNum, loadedState=null) { console.log(`Setting up Level ${levelNum}`); gameOver=false; projectile=null; secondaryProjectiles=[]; particles=[]; currentPlayer='player'; turnDisplay.textContent="Người Chơi"; levelDisplay.textContent=levelNum; currentPower=50; powerDisplay.textContent=currentPower; playerAmmoCounts=loadedState?.playerAmmoCounts||{normal:Infinity,cluster:3,heavy:2}; playerCurrentAmmo='normal'; updateAmmoSelect(); generateTerrain(); tanks=[new Tank(150,'blue',true,true),new Tank(canvasWidth-150,'red',false,false)]; if(loadedState)tanks[0].health=loadedState.playerHealth??100; else tanks[0].health=100; tanks[0].maxHealth=100; const enemyMaxH=100+(levelNum-1)*30; tanks[1].health=enemyMaxH; tanks[1].maxHealth=enemyMaxH; tanks.forEach(t=>t.updTerra()); playerHealthDisplay.textContent=tanks[0].health; enemyHealthDisplay.textContent=tanks[1].health; walls=[]; const wX=canvasWidth/2-30; const wBY=getTerrainHeightAt(wX+30); const wH=70+Math.random()*60; const wTY=Math.max(10,wBY-wH); walls.push(new Wall(wX,wTY,60,wBY-wTY)); windChangeTimer=windChangeInterval; screenShakeDuration=0; enableControls(); aiThinking=false; console.log("Level setup complete."); }
function updateAmmoSelect() { const cur=ammoSelect.value;ammoSelect.innerHTML='';let found=false; for(const t in ammoTypes){ const c=playerAmmoCounts[t]; if(c>0||c===Infinity){ const o=document.createElement('option'); o.value=t; const cT=c===Infinity?'(∞)':`(${c})`; o.textContent=`${ammoTypes[t].name} ${cT}`; ammoSelect.appendChild(o); if(t===cur)found=true;}} if(found&&playerAmmoCounts[cur]!==0){ammoSelect.value=cur;playerCurrentAmmo=cur;} else{ammoSelect.value='normal';playerCurrentAmmo='normal';} updateAmmoCountDisplay(); }
function updateAmmoCountDisplay() { const c=playerAmmoCounts[playerCurrentAmmo]; ammoCountDisplay.textContent=c===Infinity?'∞':c; }
function draw() { if(!assetsFullyChecked)return; ctx.save(); if(screenShakeDuration>0){const sX=(Math.random()-0.5)*screenShakeIntensity*2; const sY=(Math.random()-0.5)*screenShakeIntensity*2; ctx.translate(sX,sY);} if(imgBackground)ctx.drawImage(imgBackground,0,0,canvasWidth,canvasHeight); else{ctx.fillStyle='#87CEEB';ctx.fillRect(0,0,canvasWidth,canvasHeight);} ctx.fillStyle='#6B8E23';ctx.strokeStyle='#556B2F';ctx.lineWidth=1; if(terrainHeights.length>0){ctx.beginPath();ctx.moveTo(0,canvasHeight);ctx.lineTo(0,terrainHeights[0]); for(let i=1;i<terrainHeights.length;i++)ctx.lineTo(i*terrainResolution,terrainHeights[i]); ctx.lineTo(canvasWidth,terrainHeights[terrainHeights.length-1]); ctx.lineTo(canvasWidth,canvasHeight); ctx.closePath(); ctx.fill(); ctx.stroke();} walls.forEach(w=>w.draw()); tanks.forEach(t=>t.draw()); secondaryProjectiles.forEach(sp=>sp.draw()); if(projectile)projectile.draw(); if(currentPlayer==='player'&&!projectile&&!gameOver)drawTrajectoryPreview(); particles.forEach(p=>p.draw()); ctx.restore(); }
function drawTrajectoryPreview(){ const pT=tanks.find(t=>t.isP);if(!pT)return; const sP=pT.getBEnd(); let sX=sP.x;let sY=sP.y; const aR=pT.angle*Math.PI/180; const iS=currentPower*0.19; let sVX=iS*Math.cos(aR);let sVY=-iS*Math.sin(aR); ctx.fillStyle='rgba(255,255,255,0.4)'; const dt=TRAJECTORY_STEP_TIME; for(let i=0;i<TRAJECTORY_STEPS;i++){ sVY+=gravity*10*dt; sVX+=windSpeed*60*dt; sX+=sVX*60*dt; sY+=sVY*60*dt; if(i%4===0){ctx.beginPath();ctx.arc(sX,sY,1.5,0,Math.PI*2);ctx.fill();} if(sY>=getTerrainHeightAt(sX)||sX<0||sX>canvasWidth)break; }}
function update(dt){ if(gameOver||!assetsFullyChecked)return; if(screenShakeDuration>0){screenShakeDuration-=dt; screenShakeIntensity*=0.92;} else screenShakeIntensity=0; windChangeTimer+=dt*1000; if(windChangeTimer>=windChangeInterval){windChangeTimer=0; windSpeed=(Math.random()-0.5)*0.18; if(Math.abs(windSpeed)<0.02)windSpeed=0.02*Math.sign(windSpeed||1); updateWindDisplay();} tanks.forEach(t=>t.upd(dt)); let mainPFinished=!projectile; if(projectile){projectile.upd(dt); const coll=projectile.chkColl(); if(coll.collided){handleCollision(coll); mainPFinished=true;}} for(let i=secondaryProjectiles.length-1;i>=0;i--){ secondaryProjectiles[i].upd(dt); const coll=secondaryProjectiles[i].chkColl(); if(coll.collided){handleCollision(coll); secondaryProjectiles.splice(i,1);} else if(secondaryProjectiles[i].life<=0)secondaryProjectiles.splice(i,1);} for(let i=particles.length-1;i>=0;i--){particles[i].upd(dt); if(particles[i].life<=0||particles[i].r<0.5)particles.splice(i,1);} const canSwitch=mainPFinished&&secondaryProjectiles.length===0; if(canSwitch&&!gameOver){ if(currentPlayer==='player'&&!aiThinking){setTimeout(()=>{if(!projectile&&secondaryProjectiles.length===0)switchTurn();},300);} else if(currentPlayer==='enemy'&&!aiThinking){aiThinking=true;setTimeout(enemyAI,800+Math.random()*1000);}}}
function handleCollision(coll){ const{target,x,y,projectile:proj}=coll; if(!proj)return; const aD=ammoTypes[proj.aT]; const dR=aD.damage; const dmg=dR[0]+Math.floor(Math.random()*(dR[1]-dR[0]+1)); playSound('explode'); let bC=null; let pS=6; let pL=1.2; let shk=aD.shake||1; if(target instanceof Tank){bC='#FF4500';pS=7;pL=1.5;target.takeDmg(dmg);shk+=4;checkWinCondition();} else if(target==='ground'){bC='#A0522D';pS=4;pL=1.0; if(aD.effect==='heavy_impact'){modifyTerrain(x,40+Math.random()*15,20+Math.random()*10);shk+=2;}} else if(target instanceof Wall){bC='#888888';pS=3;pL=0.8;} else if(target==='expired'||target==='offscreen')return; const numP=25+Math.floor(Math.random()*30); for(let i=0;i<numP;i++)particles.push(new Particle(x,y,{color:bC,speed:pS*(0.5+Math.random()),life:pL*(0.7+Math.random()*0.6)})); triggerScreenShake(shk,0.25+shk*0.02); if(aD.effect==='cluster'&&proj===projectile)createClusterBombs(x,y,aD.count,aD.spread,proj.oT); if(proj===projectile)projectile=null;}
function triggerScreenShake(i,d){screenShakeIntensity=Math.min(MAX_SCREEN_SHAKE,Math.max(screenShakeIntensity,i)); screenShakeDuration=Math.max(screenShakeDuration,d);}
function createClusterBombs(x,y,c,sA,oT){console.log(`Creating ${c} cluster bombs`); for(let i=0;i<c;i++){ const aO=(Math.random()-0.5)*sA; const iA=270+aO+(Math.random()-0.5)*30; const iP=15+Math.random()*15; const b=new Projectile(x,y+5,iA,iP,oT,'normal'); b.life=1.5+Math.random(); secondaryProjectiles.push(b);}}
function updateWindDisplay(){ let d='';let s=''; const aW=Math.abs(windSpeed); if(aW<0.015){d='--';s='Không';}else{d=windSpeed>0?'→':'←';if(aW<0.06)s='Nhẹ';else if(aW<0.11)s='Vừa';else s='Mạnh';} windInfoDisplay.innerHTML=`${d} ${s}`; }
function switchTurn(){ if(gameOver||projectile||secondaryProjectiles.length>0)return; if(currentPlayer==='player'){currentPlayer='enemy';turnDisplay.textContent="Đối Phương";disableControls();} else{currentPlayer='player';turnDisplay.textContent="Người Chơi";enableControls();aiThinking=false;} }
function enemyAI(){ if(currentPlayer!=='enemy'||projectile||secondaryProjectiles.length>0||gameOver){aiThinking=false;return;} const enemy=tanks.find(t=>!t.isP); const player=tanks.find(t=>t.isP); if(!enemy||!player){aiThinking=false;return;} const tX=player.x+(Math.random()-0.5)*player.width*0.3; const tY=player.y-player.height/2; const dx=tX-enemy.x; const dy=enemy.y-tY; const dist=Math.sqrt(dx*dx+dy*dy); let fP=Math.max(minPower,Math.min(maxPower,35+dist*0.12)); let tA=calculateOptimalAngle_Basic(enemy,tX,tY,fP); const maxAE=25/(level+1.5); const angE=(Math.random()-0.5)*maxAE; tA+=angE; const maxPE=20/(level+1.5); fP+=(Math.random()-0.5)*maxPE; fP=Math.max(minPower,Math.min(maxPower,fP)); enemy.angle=Math.max(5,Math.min(175,tA)); console.log(`AI[L${level}] Aim: A=${enemy.angle.toFixed(1)} P=${fP.toFixed(1)}`); if(currentPlayer==='enemy'&&!projectile&&!gameOver)fire(enemy,fP); aiThinking=false; } // Reset thinking after firing attempt
function calculateOptimalAngle_Basic(t,tX,tY,p){ const dx=tX-t.x;const dy=t.y-tY; let ang=Math.atan2(dy,dx)*180/Math.PI; const dist=Math.sqrt(dx*dx+dy*dy); ang+=dist/(p*0.6+15); return ang; }
function fire(tank,power){ if(projectile||secondaryProjectiles.length>0)return; const aTK=tank.isP?playerCurrentAmmo:enemyCurrentAmmo; const aD=ammoTypes[aTK]; if(tank.isP){ const cC=playerAmmoCounts[aTK]; if(cC===0){playSound('empty');return;} if(cC!==Infinity){playerAmmoCounts[aTK]--;updateAmmoCountDisplay(); if(playerAmmoCounts[aTK]===0&&aTK!=='normal'){updateAmmoSelect();if(ammoSelect.value===aTK){playerCurrentAmmo='normal';ammoSelect.value='normal';updateAmmoCountDisplay();}}}} const bE=tank.getBEnd(); projectile=new Projectile(bE.x,bE.y,tank.angle,power,tank,aTK); playSound('fire'); if(tank.isP)disableControls(); }
function checkWinCondition(){ if(gameOver)return; const player=tanks.find(t=>t.isP); const enemy=tanks.find(t=>!t.isP); if(!player||!enemy)return; let end=false; let msg=""; if(enemy.health<=0){msg=`Chúc mừng! Bạn đã qua Level ${level}!`; end=true; saveGameState(); level++;} else if(player.health<=0){msg=`Game Over! Bạn đã thua ở Level ${level}. Chơi lại từ Level 1.`; end=true; level=1; localStorage.removeItem('tankDuelSaveData_v1');} if(end){gameOver=true; disableControls(); console.log(msg); setTimeout(()=>{alert(msg); const state=player.health>0?loadGameState():null; setupLevel(level,state);},1500);} }
function saveGameState(){ const p=tanks.find(t=>t.isP);if(gameOver&&p?.health<=0)return; const s={level:level,playerHealth:p?p.health:100,playerAmmoCounts:playerAmmoCounts,}; try{localStorage.setItem('tankDuelSaveData_v1',JSON.stringify(s));console.log("Saved:",s);}catch(e){console.error("Save failed:",e);}}
function loadGameState(){ try{const d=localStorage.getItem('tankDuelSaveData_v1'); if(d){const s=JSON.parse(d); console.log("Loaded:",s); if(typeof s.level==='number'&&s.level>0){level=s.level;return s;}}}catch(e){console.error("Load failed:",e); localStorage.removeItem('tankDuelSaveData_v1');} level=1;return null;}
function disableControls() { btnMoveLeft.disabled=true; btnMoveRight.disabled=true; btnAngleUp.disabled=true; btnAngleDown.disabled=true; btnPowerUp.disabled=true; btnPowerDown.disabled=true; btnFire.disabled=true; ammoSelect.disabled=true; }
function enableControls() { if(gameOver){disableControls();return;} if(currentPlayer==='player'){ btnMoveLeft.disabled=false; btnMoveRight.disabled=false; btnAngleUp.disabled=false; btnAngleDown.disabled=false; btnPowerUp.disabled=false; btnPowerDown.disabled=false; btnFire.disabled=false; ammoSelect.disabled=false;} else{disableControls();}}

// --- Event Listeners Setup ---
function setupEventListeners() {
    const addSafeListener = (el, ev, h) => { if(el){ const opts=(ev==='touchstart'||ev==='touchmove')?{passive:false}:undefined; el.removeEventListener(ev, h); el.addEventListener(ev, h, opts); if(el.tagName==='BUTTON'&&ev==='click'&&'ontouchstart' in window){ const tH=(e)=>{e.preventDefault();h(e);el.style.transition='transform 0.05s ease-out';el.style.transform='scale(0.95)';setTimeout(()=>el.style.transform='scale(1)',80);}; el.removeEventListener('touchstart',tH); el.addEventListener('touchstart',tH,{passive:false}); }} else console.warn(`Element missing for ${ev}`); };
    addSafeListener(btnMoveLeft, 'click', ()=>{if(!btnMoveLeft.disabled && tanks[0])tanks[0].move(-1,1/10);}); // Added tank[0] check
    addSafeListener(btnMoveRight, 'click', ()=>{if(!btnMoveRight.disabled && tanks[0])tanks[0].move(1,1/10);});
    addSafeListener(btnAngleUp, 'click', ()=>{if(!btnAngleUp.disabled && tanks[0])tanks[0].aim(2);});
    addSafeListener(btnAngleDown, 'click', ()=>{if(!btnAngleDown.disabled && tanks[0])tanks[0].aim(-2);});
    addSafeListener(btnPowerUp, 'click', ()=>{if(!btnPowerUp.disabled){currentPower=Math.min(maxPower,currentPower+5); powerDisplay.textContent=currentPower;}});
    addSafeListener(btnPowerDown, 'click', ()=>{if(!btnPowerDown.disabled){currentPower=Math.max(minPower,currentPower-5); powerDisplay.textContent=currentPower;}});
    addSafeListener(btnFire, 'click', ()=>{if(!btnFire.disabled && tanks[0])fire(tanks[0],currentPower);});
    addSafeListener(ammoSelect, 'change', (e)=>{playerCurrentAmmo=e.target.value; updateAmmoCountDisplay();});
    addSafeListener(btnToggleMusic, 'click', toggleMusic);

    // User Interaction Listener for Audio
    const handleFirstInteraction = () => { if(!userInteracted){ console.log("Interaction."); userInteracted=true; if(window.tryLoadAudioDeferred)window.tryLoadAudioDeferred(); document.removeEventListener('click',handleFirstInteraction); document.removeEventListener('touchstart',handleFirstInteraction); document.removeEventListener('keydown',handleFirstInteraction); } };
    document.addEventListener('click',handleFirstInteraction,{once:true}); document.addEventListener('touchstart',handleFirstInteraction,{once:true}); document.addEventListener('keydown',handleFirstInteraction,{once:true});
}

// --- Game Loop ---
let animationFrameId = null; // Store frame ID for potential cancelling
function gameLoop(currentTime) {
    const now = performance.now();
    const deltaTime = lastTime === 0 ? (1/60) : Math.min(0.05, (now - lastTime)/1000);
    lastTime = now;

    if (!gamePaused && assetsFullyChecked) { // Only update/draw if not paused and assets checked
        try {
            update(deltaTime);
            draw();
        } catch (error) {
            console.error("Error in game loop:", error);
            displayError(`Lỗi trong game loop: ${error.message}. Thử tải lại.`);
            // Optionally cancel the loop on critical error
            // if (animationFrameId) cancelAnimationFrame(animationFrameId);
            gamePaused = true; // Pause game on error
        }
    }
    // Always request next frame unless explicitly stopped
    if (!gamePaused) {
       animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// --- Start Game ---
function startGameLogic() {
    console.log("Starting Game Logic...");
    // Basic check if canvas context exists
    if (!ctx) {
        displayError("Không thể lấy context 2D từ canvas. Game không thể chạy.");
        return;
    }
    setupEventListeners();
    const loadedState = loadGameState();
    setupLevel(level, loadedState); // Setup based on loaded level or default 1
    updateWindDisplay();
    gamePaused = false; // Ensure game is not paused initially
    lastTime = performance.now();
    if (animationFrameId) cancelAnimationFrame(animationFrameId); // Cancel previous loop if any
    animationFrameId = requestAnimationFrame(gameLoop); // Start the main loop
}

// --- Initial Load ---
// Ensure DOM is fully loaded before trying to access elements
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing asset loading...");
    if (loadingScreen) loadingScreen.classList.remove('hidden');
    else console.error("Loading screen element not found in DOM!");
    loadAssets(); // Start loading assets after DOM is ready
});
