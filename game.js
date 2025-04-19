const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Cài đặt Responsive ---
function resizeCanvas() {
    const aspectRatio = 9 / 16;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    let canvasHeight = windowHeight * 0.9;
    let canvasWidth = canvasHeight * aspectRatio;
    if (canvasWidth > windowWidth * 0.95) {
        canvasWidth = windowWidth * 0.95;
        canvasHeight = canvasWidth / aspectRatio;
    }
    canvas.width = Math.floor(canvasWidth);
    canvas.height = Math.floor(canvasHeight);
    scaleFactor = canvas.height / 512; // Kích thước gốc tham chiếu
    updateGameConstants(); // Cập nhật hằng số khi resize
}

let scaleFactor = 1;
// Gọi resizeCanvas lần đầu
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Hằng số Game (Điều chỉnh theo scaleFactor) ---
let gravity;
let tankBoost; // Đổi tên từ birdFlap
let pipeSpeed;
let pipeGap;
let pipeWidth;
let tankBodyWidth; // Kích thước thân xe tăng
let tankBodyHeight;
let tankTurretWidth; // Kích thước nòng
let tankTurretHeight;
let turretRotationSpeed; // Tốc độ quay nòng pháo

function updateGameConstants() {
    gravity = 0.3 * scaleFactor;
    tankBoost = -6 * scaleFactor; // Lực "nhảy" của xe tăng
    pipeSpeed = 2 * scaleFactor;
    pipeGap = 120 * scaleFactor;
    pipeWidth = 60 * scaleFactor;

    // --- KÍCH THƯỚC MỚI CHO XE TĂNG (Điều chỉnh theo ảnh của bạn) ---
    tankBodyWidth = 40 * scaleFactor;
    tankBodyHeight = 30 * scaleFactor;
    tankTurretWidth = 30 * scaleFactor; // Nòng có thể dài hơn rộng
    tankTurretHeight = 10 * scaleFactor;
    // --- ---

    turretRotationSpeed = 0.05; // Radian mỗi frame
}

// --- Biến Game ---
let tank = { // Đổi tên từ bird
    x: 50 * scaleFactor,
    y: canvas.height / 2 - (tankBodyHeight / 2), // Căn giữa theo thân xe
    width: tankBodyWidth,   // Kích thước va chạm chính là thân xe
    height: tankBodyHeight,
    velocity: 0,
    turretAngle: 0 // Góc quay của nòng pháo (radian)
};

let pipes = [];
let score = 0;
let frameCount = 0;
let gameState = 'start'; // Trạng thái: start, playing, gameOver
let imagesLoaded = 0;
const totalImages = 4; // Số lượng ảnh cần tải (thêm 2 ảnh tank, bỏ ảnh bird)

// --- Tải hình ảnh ---
const tankBodyImg = new Image();
const tankTurretImg = new Image();
const pipeTopImg = new Image();
const pipeBottomImg = new Image();
// const bgImg = new Image(); // Bỏ qua background nếu muốn đơn giản

let loadCounter = 0;
const totalAssets = 4; // tankBody, tankTurret, pipeTop, pipeBottom

function assetLoaded() {
    loadCounter++;
    if (loadCounter === totalAssets) {
        console.log("Tất cả hình ảnh đã tải xong!");
        // Khởi động game sau khi tải xong ảnh
        resizeCanvas(); // Chạy lại resize để đảm bảo scaleFactor đúng
        gameLoop(); // Bắt đầu vòng lặp game
    }
}

// Gán src và onload
tankBodyImg.onload = assetLoaded;
tankTurretImg.onload = assetLoaded;
pipeTopImg.onload = assetLoaded;
pipeBottomImg.onload = assetLoaded;

tankBodyImg.src = 'assets/tank-body.png';
tankTurretImg.src = 'assets/tank-turret.png';
pipeTopImg.src = 'assets/pipe-top.png';
pipeBottomImg.src = 'assets/pipe-bottom.png';
// bgImg.src = 'assets/background.png'; // Nếu dùng background

// --- Hàm Vẽ ---
function drawTank() {
    // --- Vẽ Nòng Pháo (vẽ trước để nằm dưới thân nếu gốc quay ở tâm thân) ---
    // Tuy nhiên, thường nòng sẽ nằm trên, nên vẽ sau hoặc điều chỉnh gốc quay

    // --- Vẽ Thân Xe Tăng ---
    ctx.drawImage(tankBodyImg, tank.x, tank.y, tank.width, tank.height);

    // --- Vẽ Nòng Pháo Quay ---
    ctx.save(); // Lưu trạng thái canvas hiện tại (vị trí, góc quay)

    // Di chuyển gốc tọa độ đến điểm xoay của nòng pháo trên thân xe
    // Ví dụ: tâm của thân xe tăng
    const pivotX = tank.x + tank.width / 2;
    const pivotY = tank.y + tank.height / 2; // Điều chỉnh nếu điểm nối khác
    ctx.translate(pivotX, pivotY);

    // Xoay canvas theo góc của nòng pháo
    ctx.rotate(tank.turretAngle);

    // Vẽ nòng pháo tại gốc tọa độ mới (0,0) sau khi đã translate và rotate
    // Cần điều chỉnh vị trí vẽ nòng pháo so với điểm pivot
    // Ví dụ: Vẽ nòng pháo sao cho phần gốc của nó nằm tại pivot
    // Giả sử gốc nòng pháo là chính giữa cạnh trái của ảnh nòng pháo
    ctx.drawImage(
        tankTurretImg,
        0, // Vẽ từ điểm pivot (điểm xoay)
        -tankTurretHeight / 2, // Căn giữa nòng pháo theo chiều dọc tại điểm pivot
        tankTurretWidth,
        tankTurretHeight
    );

    ctx.restore(); // Khôi phục lại trạng thái canvas trước khi vẽ nòng pháo
}


function drawPipes() {
    // Giữ nguyên như cũ, nhưng dùng ảnh pipeTopImg và pipeBottomImg
    pipes.forEach(pipe => {
        // Vẽ ống trên
        ctx.drawImage(pipeTopImg, pipe.x, pipe.topPipe.y, pipe.width, pipe.topPipe.height);
        // Vẽ ống dưới
        ctx.drawImage(pipeBottomImg, pipe.x, pipe.bottomPipe.y, pipe.width, pipe.bottomPipe.height);
    });
}

function drawScore() {
    ctx.fillStyle = 'white';
    ctx.font = `${Math.floor(30 * scaleFactor)}px Arial`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'black'; // Thêm viền đen cho dễ đọc
    ctx.lineWidth = 1 * scaleFactor;
    ctx.strokeText(score, canvas.width / 2, 50 * scaleFactor);
    ctx.fillText(score, canvas.width / 2, 50 * scaleFactor);
}

function drawStartScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = `${Math.floor(25 * scaleFactor)}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('Nhấn để Bắt đầu', canvas.width / 2, canvas.height / 2);
}

function drawGameOverScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'red'; // Màu chữ Game Over
    ctx.font = `${Math.floor(30 * scaleFactor)}px Arial BOLD`;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER!', canvas.width / 2, canvas.height / 2 - 40 * scaleFactor);
    ctx.fillStyle = 'white'; // Màu chữ điểm
    ctx.font = `${Math.floor(20 * scaleFactor)}px Arial`;
    ctx.fillText(`Điểm: ${score}`, canvas.width / 2, canvas.height / 2);
    ctx.fillText('Nhấn để Chơi lại', canvas.width / 2, canvas.height / 2 + 40 * scaleFactor);
}

// --- Hàm Cập nhật ---
function updateTank() { // Đổi tên từ updateBird
    // Cập nhật vật lý rơi
    tank.velocity += gravity;
    tank.y += tank.velocity;

    // Cập nhật góc quay nòng pháo
    tank.turretAngle += turretRotationSpeed;
    // Giữ góc quay trong khoảng 0 đến 2*PI (tùy chọn)
    // tank.turretAngle %= (2 * Math.PI);

    // Chặn không cho bay lên quá màn hình
    if (tank.y < 0) {
        tank.y = 0;
        tank.velocity = 0;
    }

    // Kiểm tra va chạm với mặt đất (Game Over)
    // Sử dụng tank.height (chiều cao thân xe) để kiểm tra
    if (tank.y + tank.height > canvas.height) {
        tank.y = canvas.height - tank.height; // Đặt xe tăng nằm trên mặt đất
        tank.velocity = 0; // Ngừng rơi
        gameState = 'gameOver';
    }
}

function createPipe() {
    // Giữ nguyên logic tạo ống
    const topPipeHeight = Math.random() * (canvas.height / 2 - pipeGap / 2) + 50 * scaleFactor;
    const bottomPipeY = topPipeHeight + pipeGap;
    const bottomPipeHeight = canvas.height - bottomPipeY;

    pipes.push({
        x: canvas.width,
        width: pipeWidth,
        scored: false,
        topPipe: { y: 0, height: topPipeHeight },
        bottomPipe: { y: bottomPipeY, height: bottomPipeHeight }
    });
}

function updatePipes() {
    // Tạo ống mới
    // Tăng tần suất ống một chút nếu muốn game nhanh hơn
    if (frameCount % 120 === 0) { // Giảm số frame để ống ra nhanh hơn (ví dụ: 120)
        createPipe();
    }

    pipes.forEach(pipe => {
        pipe.x -= pipeSpeed;

        // --- Kiểm tra va chạm ---
        // Sử dụng kích thước của thân xe tăng (tank.x, tank.y, tank.width, tank.height)
        const tankRight = tank.x + tank.width;
        const tankBottom = tank.y + tank.height;
        const pipeRight = pipe.x + pipe.width;

        // Điều kiện va chạm hình chữ nhật đơn giản
        if (
            tankRight > pipe.x &&             // Cạnh phải tank vượt qua cạnh trái ống
            tank.x < pipeRight &&            // Cạnh trái tank chưa vượt qua cạnh phải ống
            (tank.y < pipe.topPipe.height || // Đỉnh tank chạm ống trên
             tankBottom > pipe.bottomPipe.y) // Đáy tank chạm ống dưới
           )
        {
            gameState = 'gameOver';
        }

        // Tính điểm: nếu xe tăng đã vượt qua giữa ống và chưa tính điểm
        // Dùng tank.x để kiểm tra
        if (!pipe.scored && tank.x > pipe.x + pipe.width / 2) {
            score++;
            pipe.scored = true;
            // Có thể thêm âm thanh tính điểm ở đây
        }
    });

    // Xóa ống đã ra khỏi màn hình bên trái
    pipes = pipes.filter(pipe => pipe.x + pipe.width > 0);
}

// --- Xử lý Input ---
function handleInput() {
    if (gameState === 'playing') {
        tank.velocity = tankBoost; // Xe tăng "nhảy" lên
        // Có thể thêm âm thanh nhảy ở đây
    } else if (gameState === 'start' || gameState === 'gameOver') {
        resetGame();
        gameState = 'playing';
    }
}

// Lắng nghe sự kiện
canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    handleInput();
});
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ') { // Thêm phím Space
        handleInput();
    }
});


// --- Reset Game ---
function resetGame() {
    // Đặt lại vị trí, vận tốc, góc quay của xe tăng
    tank.y = canvas.height / 2 - (tankBodyHeight / 2);
    tank.velocity = 0;
    tank.turretAngle = 0; // Reset góc nòng pháo

    pipes = []; // Xóa hết ống cũ
    score = 0;
    frameCount = 0; // Reset bộ đếm frame
    // gameState sẽ được đặt thành 'playing' trong handleInput
}


// --- Vòng lặp Game (Game Loop) ---
let lastTime = 0; // Biến để theo dõi thời gian cho delta time (tùy chọn nâng cao)

function gameLoop(currentTime) { // currentTime được cung cấp bởi requestAnimationFrame
    // --- Tùy chọn: Tính Delta Time để chuyển động mượt hơn trên các màn hình khác nhau ---
    // const deltaTime = (currentTime - lastTime) / 1000; // Delta time tính bằng giây
    // lastTime = currentTime;
    // Nếu dùng delta time, bạn cần nhân các giá trị vật lý (gravity, velocity, speed) với deltaTime
    // Ví dụ: tank.velocity += gravity * deltaTime * 60; (nhân 60 để giữ tỉ lệ gần đúng)
    // tank.y += tank.velocity * deltaTime * 60;
    // pipe.x -= pipeSpeed * deltaTime * 60;
    // Hiện tại, bỏ qua delta time để giữ code đơn giản hơn, requestAnimationFrame đã khá mượt.

    // 1. Xóa màn hình
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Vẽ nền (Màu hoặc ảnh)
    ctx.fillStyle = '#70c5ce'; // Màu nền xanh
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Hoặc vẽ ảnh nền: ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    // 2. Cập nhật và Vẽ dựa trên trạng thái game
    if (gameState === 'playing') {
        updateTank(); // Cập nhật vị trí, vận tốc, góc nòng pháo
        updatePipes(); // Di chuyển ống, tạo ống mới, kiểm tra va chạm, tính điểm
        frameCount++;

        drawPipes(); // Vẽ các ống
        drawTank();  // Vẽ xe tăng (thân và nòng quay)
        drawScore(); // Vẽ điểm số

    } else if (gameState === 'start') {
        drawTank(); // Vẽ xe tăng ở vị trí chờ
        drawPipes(); // Vẽ các ống tĩnh nếu muốn
        drawStartScreen(); // Vẽ màn hình chờ "Nhấn để bắt đầu"
    } else if (gameState === 'gameOver') {
        // Vẽ trạng thái cuối cùng trước khi thua
        drawPipes();
        drawTank(); // Vẽ xe tăng ở vị trí thua (có thể thêm hiệu ứng nổ?)
        drawGameOverScreen(); // Vẽ màn hình "Game Over" và điểm
    }

    // Yêu cầu frame tiếp theo
    requestAnimationFrame(gameLoop);
}

// --- Bắt đầu Game ---
// Game sẽ bắt đầu trong hàm assetLoaded() sau khi tất cả ảnh đã được tải.
// Không gọi gameLoop() trực tiếp ở đây nữa.
console.log("Đang tải hình ảnh...");
