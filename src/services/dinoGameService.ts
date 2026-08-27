import * as vscode from "vscode";

export class DinoGameService {
  private static instance: DinoGameService;
  private currentPanel?: vscode.WebviewPanel;

  private constructor() {}

  public static getInstance(): DinoGameService {
    if (!DinoGameService.instance) {
      DinoGameService.instance = new DinoGameService();
    }
    return DinoGameService.instance;
  }

  public openGame(context: vscode.ExtensionContext): void {
    if (this.currentPanel) {
      this.currentPanel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "ninjaDinoRunner",
      "🦖 Ninja Dino Runner",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    panel.webview.html = this.getWebviewContent();
    panel.onDidDispose(() => {
      this.currentPanel = undefined;
    });

    this.currentPanel = panel;
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ninja Dino Runner</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #18181b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    .header {
      margin-bottom: 16px;
      text-align: center;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .header p {
      font-size: 13px;
      color: #a1a1aa;
      margin-top: 4px;
    }
    #game-container {
      position: relative;
      width: 700px;
      height: 250px;
      background: #27272a;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      border: 1px solid #3f3f46;
      overflow: hidden;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .controls {
      margin-top: 18px;
      display: flex;
      gap: 16px;
      align-items: center;
      font-size: 13px;
      color: #a1a1aa;
    }
    .key-badge {
      background: #3f3f46;
      color: #f4f4f5;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      border: 1px solid #52525b;
    }
    .btn {
      background: #38bdf8;
      color: #0f172a;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .btn:hover { background: #7dd3fc; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🦖 Ninja Dino Runner</h1>
    <p>Jump to pass time while your servers are compiling!</p>
  </div>

  <div id="game-container">
    <canvas id="gameCanvas" width="700" height="250"></canvas>
  </div>

  <div class="controls">
    <span>Press <span class="key-badge">Space</span> or <span class="key-badge">↑</span> to Jump</span>
    <span>•</span>
    <span>Click canvas or press <button class="btn" id="restartBtn">Play / Restart</button></span>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const restartBtn = document.getElementById('restartBtn');

    let gameRunning = false;
    let score = 0;
    let highScore = 0;
    let speed = 6;
    let gravity = 0.65;
    let obstacles = [];
    let clouds = [];
    let frame = 0;

    const dino = {
      x: 60,
      y: 190,
      width: 40,
      height: 44,
      vy: 0,
      jumping: false,
      groundY: 190,
      legFrame: 0
    };

    function resetGame() {
      score = 0;
      speed = 6;
      obstacles = [];
      clouds = [
        { x: 200, y: 40, width: 50, speed: 0.8 },
        { x: 500, y: 70, width: 70, speed: 1.0 }
      ];
      dino.y = dino.groundY;
      dino.vy = 0;
      dino.jumping = false;
      gameRunning = true;
    }

    function jump() {
      if (!gameRunning) {
        resetGame();
        return;
      }
      if (!dino.jumping) {
        dino.vy = -12;
        dino.jumping = true;
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    });

    canvas.addEventListener('click', jump);
    restartBtn.addEventListener('click', () => {
      resetGame();
      canvas.focus();
    });

    function spawnObstacle() {
      const type = Math.random() > 0.4 ? 'cactus' : 'cactusGroup';
      const width = type === 'cactus' ? 22 : 44;
      const height = 38 + Math.floor(Math.random() * 12);
      obstacles.push({
        x: canvas.width + 20,
        y: canvas.height - height - 16,
        width: width,
        height: height
      });
    }

    function update() {
      if (!gameRunning) return;
      frame++;
      score += 0.2;
      if (score > highScore) highScore = Math.floor(score);

      // Increase speed gradually
      if (frame % 300 === 0 && speed < 14) {
        speed += 0.5;
      }

      // Dino physics
      dino.y += dino.vy;
      dino.vy += gravity;
      if (dino.y >= dino.groundY) {
        dino.y = dino.groundY;
        dino.vy = 0;
        dino.jumping = false;
      }

      if (frame % 6 === 0) {
        dino.legFrame = dino.legFrame === 0 ? 1 : 0;
      }

      // Obstacles
      if (frame % Math.max(50, Math.floor(100 - speed * 4)) === 0) {
        if (Math.random() > 0.3) spawnObstacle();
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.x -= speed;

        // Collision check
        if (
          dino.x + 8 < obs.x + obs.width &&
          dino.x + dino.width - 8 > obs.x &&
          dino.y + 8 < obs.y + obs.height &&
          dino.y + dino.height > obs.y
        ) {
          gameRunning = false;
        }

        if (obs.x + obs.width < 0) {
          obstacles.splice(i, 1);
        }
      }

      // Clouds
      for (const cloud of clouds) {
        cloud.x -= cloud.speed;
        if (cloud.x + cloud.width < 0) {
          cloud.x = canvas.width + 40;
          cloud.y = 30 + Math.random() * 60;
        }
      }
    }

    function drawDino() {
      ctx.fillStyle = '#38bdf8';
      // Body
      ctx.fillRect(dino.x + 14, dino.y + 10, 22, 24);
      // Head
      ctx.fillRect(dino.x + 22, dino.y, 18, 16);
      // Eye
      ctx.fillStyle = '#18181b';
      ctx.fillRect(dino.x + 32, dino.y + 4, 3, 3);
      // Snout
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(dino.x + 34, dino.y + 8, 6, 8);
      // Arms
      ctx.fillRect(dino.x + 32, dino.y + 20, 6, 4);
      // Tail
      ctx.fillRect(dino.x, dino.y + 18, 14, 8);
      ctx.fillRect(dino.x + 4, dino.y + 14, 10, 6);

      // Legs
      if (dino.jumping) {
        ctx.fillRect(dino.x + 18, dino.y + 34, 4, 10);
        ctx.fillRect(dino.x + 28, dino.y + 34, 4, 8);
      } else {
        if (dino.legFrame === 0) {
          ctx.fillRect(dino.x + 18, dino.y + 34, 4, 10);
          ctx.fillRect(dino.x + 28, dino.y + 34, 4, 6);
        } else {
          ctx.fillRect(dino.x + 18, dino.y + 34, 4, 6);
          ctx.fillRect(dino.x + 28, dino.y + 34, 4, 10);
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw clouds
      ctx.fillStyle = '#3f3f46';
      for (const cloud of clouds) {
        ctx.beginPath();
        ctx.arc(cloud.x + 15, cloud.y, 14, 0, Math.PI * 2);
        ctx.arc(cloud.x + 30, cloud.y - 6, 18, 0, Math.PI * 2);
        ctx.arc(cloud.x + 45, cloud.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Ground
      ctx.strokeStyle = '#52525b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 16);
      ctx.lineTo(canvas.width, canvas.height - 16);
      ctx.stroke();

      // Ground bumps
      ctx.fillStyle = '#52525b';
      for (let x = (frame * speed) % 40; x < canvas.width; x += 40) {
        ctx.fillRect(canvas.width - x, canvas.height - 14, 4, 2);
      }

      // Draw Obstacles (Cacti)
      ctx.fillStyle = '#4ade80';
      for (const obs of obstacles) {
        // Main stem
        ctx.fillRect(obs.x + 6, obs.y, obs.width - 12, obs.height);
        // Arms
        ctx.fillRect(obs.x, obs.y + 10, 6, 12);
        ctx.fillRect(obs.x, obs.y + 8, 12, 4);
        if (obs.width > 25) {
          ctx.fillRect(obs.x + obs.width - 6, obs.y + 14, 6, 12);
          ctx.fillRect(obs.x + obs.width - 12, obs.y + 12, 12, 4);
        }
      }

      // Draw Dino
      drawDino();

      // Draw Score
      ctx.fillStyle = '#f4f4f5';
      ctx.font = '14px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('HI ' + String(highScore).padStart(5, '0') + '   ' + String(Math.floor(score)).padStart(5, '0'), canvas.width - 20, 30);

      // Game Over Screen
      if (!gameRunning) {
        ctx.fillStyle = 'rgba(24, 24, 27, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('G A M E   O V E R', canvas.width / 2, canvas.height / 2 - 10);

        ctx.fillStyle = '#a1a1aa';
        ctx.font = '14px sans-serif';
        ctx.fillText('Press Space to Play Again', canvas.width / 2, canvas.height / 2 + 20);
      }
    }

    function loop() {
      update();
      draw();
      requestAnimationFrame(loop);
    }

    resetGame();
    loop();
  </script>
</body>
</html>`;
  }
}
