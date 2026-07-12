import { useEffect, useRef } from "react";
import * as LJS from "littlejsengine";
import { Shell } from "./components/Shell";

// ─── Game constants ────────────────────────────────────────────────────────────
const WORLD_W = 20;
const WORLD_H = 28;

const PADDLE_Y = -11;
const PADDLE_W = 4;
const PADDLE_H = 0.55;
const PADDLE_SPEED = 18;

const BALL_RADIUS = 0.35;
const BALL_SPEED_INIT = 12;
const BALL_SPEED_MAX = 22;
const BALL_SPEED_INC = 0.3;

const BRICK_COLS = 10;
const BRICK_ROWS = 6;
const BRICK_W = 1.7;
const BRICK_H = 0.65;
const BRICK_GAP = 0.12;
const BRICK_TOP = 10.5;

const LIVES_INIT = 3;
const HS_KEY = "boombricks_highscore";

// ─── Colours per row ──────────────────────────────────────────────────────────
const ROW_COLORS = [
  new LJS.Color(1.0, 0.22, 0.22),   // red
  new LJS.Color(1.0, 0.55, 0.10),   // orange
  new LJS.Color(1.0, 0.88, 0.10),   // yellow
  new LJS.Color(0.20, 0.85, 0.35),  // green
  new LJS.Color(0.15, 0.60, 1.00),  // blue
  new LJS.Color(0.75, 0.25, 1.00),  // purple
];

const ROW_POINTS = [60, 50, 40, 30, 20, 10];

// ─── Sounds (ZzFX arrays) ─────────────────────────────────────────────────────
let sndBounce: LJS.Sound;
let sndBreak: LJS.Sound;
let sndLose: LJS.Sound;
let sndStart: LJS.Sound;
let sndWin: LJS.Sound;

// ─── Game state ───────────────────────────────────────────────────────────────
type Phase = "start" | "play" | "gameover" | "win";

let phase: Phase = "start";
let score = 0;
let lives = LIVES_INIT;
let highScore = 0;
let level = 1;

// Ball
let ballPos: LJS.Vector2;
let ballVel: LJS.Vector2;
let ballActive = false;

// Paddle
let paddleX = 0;

// Bricks: row * BRICK_COLS + col → hp (0 = dead)
let bricks: number[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadHS() {
  const v = localStorage.getItem(HS_KEY);
  highScore = v ? (parseInt(v, 10) || 0) : 0;
}

function saveHS() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem(HS_KEY, String(highScore));
  }
}

function brickPos(row: number, col: number): LJS.Vector2 {
  const startX = -((BRICK_COLS - 1) * (BRICK_W + BRICK_GAP)) / 2;
  const x = startX + col * (BRICK_W + BRICK_GAP);
  const y = BRICK_TOP - row * (BRICK_H + BRICK_GAP);
  return LJS.vec2(x, y);
}

function initBricks() {
  bricks = [];
  // Higher levels: some bricks have 2 HP
  const doubleChance = Math.min(0.05 * (level - 1), 0.5);
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const hp = Math.random() < doubleChance ? 2 : 1;
      bricks.push(hp);
    }
  }
}

function resetBall() {
  ballPos = LJS.vec2(paddleX, PADDLE_Y + PADDLE_H + BALL_RADIUS + 0.05);
  ballVel = LJS.vec2(0, 0);
  ballActive = false;
}

function launchBall() {
  if (ballActive) return;
  const angle = (Math.random() * 60 - 30) * (Math.PI / 180);
  const speed = BALL_SPEED_INIT + (level - 1) * 1.5;
  ballVel = LJS.vec2(Math.sin(angle) * speed, Math.cos(angle) * speed);
  ballActive = true;
  sndStart.play();
}

function brickExplode(pos: LJS.Vector2, color: LJS.Color) {
  new LJS.ParticleEmitter(
    pos, 0,          // pos, angle
    0.3, 0,          // emitSize, emitTime (0 = burst)
    40, Math.PI * 2, // emitRate, emitConeAngle
    undefined,       // tileInfo
    color, color.scale(0.5, 1),  // colorStartA, colorStartB
    new LJS.Color(color.r, color.g, color.b, 0),
    new LJS.Color(color.r * 0.5, color.g * 0.5, color.b * 0.5, 0),
    0.5, 0.15, 0.2,  // particleTime, sizeStart, sizeEnd
    8, 1, 0.5,       // speed, angleSpeed, damping
    0, 0.3, false,   // gravityScale, particleConeAngle, fadeRate
    0.5, true        // randomness, collide
  );
}

function paddleHitParticle(pos: LJS.Vector2) {
  new LJS.ParticleEmitter(
    pos, 0,
    0.1, 0,
    8, Math.PI / 4,
    undefined,
    new LJS.Color(1, 1, 1, 1), new LJS.Color(0.8, 0.9, 1, 1),
    new LJS.Color(1, 1, 1, 0), new LJS.Color(0.8, 0.9, 1, 0),
    0.25, 0.08, 0.03,
    4, 2, 0.8,
    0, 0.3, false,
    0.3, false
  );
}

// ─── LittleJS callbacks ───────────────────────────────────────────────────────
function gameInit() {
  LJS.setCameraPos(LJS.vec2(0, 0));
  LJS.setCameraScale(32);

  // ZzFX sounds
  sndBounce = new LJS.Sound([1.2, , 180, , 0.02, 0.05, 0, 1.8, , , , , , 0.5]);
  sndBreak  = new LJS.Sound([2, 0.1, 300, , 0.05, 0.2, 3, 0.8, , , , , , , , 0.4, 0.1, 0.6, 0.1]);
  sndLose   = new LJS.Sound([1, 0.2, 120, 0.3, 0.2, 0.5, 1, 0.5, -3, , , , , 0.5, , , , 0.6, 0.2]);
  sndStart  = new LJS.Sound([1, , 440, , 0.04, 0.08, , 1.5, , , 440, 0.06, , , , , , 0.5]);
  sndWin    = new LJS.Sound([1.5, , 600, , 0.1, 0.3, , 1.2, , 5, 200, 0.1, , , , , , 0.7, 0.1]);

  loadHS();
  paddleX = 0;
  initBricks();
  resetBall();
}

function gameUpdate() {
  // ── Paddle movement ──────────────────────────────────────────────────────────
  const halfW = WORLD_W / 2 - PADDLE_W / 2 - 0.2;

  // Keyboard
  if (LJS.keyIsDown("ArrowLeft"))  paddleX -= PADDLE_SPEED * LJS.timeDelta;
  if (LJS.keyIsDown("ArrowRight")) paddleX += PADDLE_SPEED * LJS.timeDelta;
  if (LJS.keyIsDown("KeyA"))       paddleX -= PADDLE_SPEED * LJS.timeDelta;
  if (LJS.keyIsDown("KeyD"))       paddleX += PADDLE_SPEED * LJS.timeDelta;

  // Mouse / touch — map mousePos.x (world space) to paddle
  if (phase === "play") {
    const mx = LJS.mousePos.x;
    paddleX += (mx - paddleX) * 0.25;
  }

  paddleX = LJS.clamp(paddleX, -halfW, halfW);

  // ── Phase: start ─────────────────────────────────────────────────────────────
  if (phase === "start") {
    if (LJS.mouseWasPressed(0) || LJS.keyWasPressed("Space") || LJS.keyWasPressed("Enter")) {
      phase = "play";
      score = 0;
      lives = LIVES_INIT;
      level = 1;
      initBricks();
      resetBall();
    }
    return;
  }

  // ── Phase: gameover / win ────────────────────────────────────────────────────
  if (phase === "gameover" || phase === "win") {
    if (LJS.mouseWasPressed(0) || LJS.keyWasPressed("Space") || LJS.keyWasPressed("Enter")) {
      phase = "start";
    }
    return;
  }

  // ── Phase: play ──────────────────────────────────────────────────────────────

  // Launch ball
  if (!ballActive) {
    // Stick ball to paddle
    ballPos = LJS.vec2(paddleX, PADDLE_Y + PADDLE_H / 2 + BALL_RADIUS + 0.05);
    if (LJS.mouseWasPressed(0) || LJS.keyWasPressed("Space")) {
      launchBall();
    }
    return;
  }

  // Move ball
  const dt = LJS.timeDelta;
  ballPos = LJS.vec2(ballPos.x + ballVel.x * dt, ballPos.y + ballVel.y * dt);

  // ── Wall collisions ──────────────────────────────────────────────────────────
  const halfWall = WORLD_W / 2 - BALL_RADIUS;
  const topWall  = WORLD_H / 2 - BALL_RADIUS;

  if (ballPos.x < -halfWall) { ballPos = LJS.vec2(-halfWall, ballPos.y); ballVel = LJS.vec2(-ballVel.x, ballVel.y); sndBounce.play(); }
  if (ballPos.x >  halfWall) { ballPos = LJS.vec2( halfWall, ballPos.y); ballVel = LJS.vec2(-ballVel.x, ballVel.y); sndBounce.play(); }
  if (ballPos.y >  topWall)  { ballPos = LJS.vec2(ballPos.x,  topWall); ballVel = LJS.vec2(ballVel.x, -ballVel.y); sndBounce.play(); }

  // ── Ball lost ────────────────────────────────────────────────────────────────
  if (ballPos.y < -WORLD_H / 2 - 2) {
    lives--;
    sndLose.play();
    // Lose particle at paddle
    brickExplode(LJS.vec2(paddleX, PADDLE_Y), new LJS.Color(1, 0.3, 0.3));
    if (lives <= 0) {
      saveHS();
      phase = "gameover";
    } else {
      resetBall();
    }
    return;
  }

  // ── Paddle collision ─────────────────────────────────────────────────────────
  const px = paddleX;
  const py = PADDLE_Y;
  const halfPW = PADDLE_W / 2 + BALL_RADIUS;
  const halfPH = PADDLE_H / 2 + BALL_RADIUS;

  if (
    ballVel.y < 0 &&
    ballPos.x > px - halfPW && ballPos.x < px + halfPW &&
    ballPos.y > py - halfPH && ballPos.y < py + halfPH
  ) {
    // Angle based on hit position
    const hitFrac = (ballPos.x - px) / (PADDLE_W / 2); // -1..1
    const bounceAngle = hitFrac * 65 * (Math.PI / 180);
    const speed = Math.min(
      Math.sqrt(ballVel.x ** 2 + ballVel.y ** 2) + BALL_SPEED_INC,
      BALL_SPEED_MAX
    );
    ballVel = LJS.vec2(Math.sin(bounceAngle) * speed, Math.cos(bounceAngle) * speed);
    ballPos = LJS.vec2(ballPos.x, py + halfPH);
    sndBounce.play();
    paddleHitParticle(LJS.vec2(ballPos.x, py + PADDLE_H / 2));
  }

  // ── Brick collisions ─────────────────────────────────────────────────────────
  let bricksLeft = 0;

  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const idx = r * BRICK_COLS + c;
      const hp = bricks[idx] ?? 0;
      if (hp <= 0) continue;
      bricksLeft++;

      const bp = brickPos(r, c);
      const halfBW = BRICK_W / 2 + BALL_RADIUS;
      const halfBH = BRICK_H / 2 + BALL_RADIUS;

      if (
        ballPos.x > bp.x - halfBW && ballPos.x < bp.x + halfBW &&
        ballPos.y > bp.y - halfBH && ballPos.y < bp.y + halfBH
      ) {
        // Determine collision axis
        const overlapX = halfBW - Math.abs(ballPos.x - bp.x);
        const overlapY = halfBH - Math.abs(ballPos.y - bp.y);

        if (overlapX < overlapY) {
          ballVel = LJS.vec2(-ballVel.x, ballVel.y);
          ballPos = LJS.vec2(
            ballPos.x + (ballPos.x < bp.x ? -overlapX : overlapX),
            ballPos.y
          );
        } else {
          ballVel = LJS.vec2(ballVel.x, -ballVel.y);
          ballPos = LJS.vec2(
            ballPos.x,
            ballPos.y + (ballPos.y < bp.y ? -overlapY : overlapY)
          );
        }

        bricks[idx] = hp - 1;
        const color = ROW_COLORS[r] ?? new LJS.Color(1, 1, 1);

        if ((bricks[idx] ?? 0) <= 0) {
          score += ROW_POINTS[r] ?? 10;
          bricksLeft--;
          brickExplode(bp, color);
          sndBreak.play();
        } else {
          // Cracked — smaller burst
          new LJS.ParticleEmitter(
            bp, 0, 0.1, 0, 10, Math.PI * 2,
            undefined,
            color, color.scale(0.7, 1),
            new LJS.Color(color.r, color.g, color.b, 0),
            new LJS.Color(color.r * 0.5, color.g * 0.5, color.b * 0.5, 0),
            0.3, 0.08, 0.02, 4, 1, 0.7,
            0, 0.3, false, 0.3, false
          );
          sndBounce.play();
        }

        break; // one brick per frame
      }
    }
  }

  // ── Level clear ──────────────────────────────────────────────────────────────
  if (bricksLeft === 0) {
    sndWin.play();
    level++;
    initBricks();
    resetBall();
    if (level > 5) {
      saveHS();
      phase = "win";
    }
  }
}

function gameUpdatePost() {}

// ─── Rendering ────────────────────────────────────────────────────────────────
function gameRender() {
  // Background gradient-ish: draw a dark rect filling the world
  LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(WORLD_W + 2, WORLD_H + 2), new LJS.Color(0.05, 0.05, 0.12));

  // Wall outlines
  const wallColor = new LJS.Color(0.2, 0.2, 0.35);
  LJS.drawRect(LJS.vec2(-(WORLD_W / 2 + 0.3), 0), LJS.vec2(0.5, WORLD_H + 2), wallColor);
  LJS.drawRect(LJS.vec2( (WORLD_W / 2 + 0.3), 0), LJS.vec2(0.5, WORLD_H + 2), wallColor);
  LJS.drawRect(LJS.vec2(0,  WORLD_H / 2 + 0.3), LJS.vec2(WORLD_W + 2, 0.5), wallColor);

  // ── Bricks ──────────────────────────────────────────────────────────────────
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const idx = r * BRICK_COLS + c;
      const hp = bricks[idx] ?? 0;
      if (hp <= 0) continue;

      const bp = brickPos(r, c);
      const baseColor = ROW_COLORS[r] ?? new LJS.Color(1, 1, 1);
      const col = hp === 1 ? baseColor : baseColor.scale(1.3, 1);

      // Brick body
      LJS.drawRect(bp, LJS.vec2(BRICK_W - 0.06, BRICK_H - 0.06), col);
      // Shine
      LJS.drawRect(
        LJS.vec2(bp.x - BRICK_W * 0.2, bp.y + BRICK_H * 0.18),
        LJS.vec2(BRICK_W * 0.5, BRICK_H * 0.18),
        new LJS.Color(1, 1, 1, 0.18)
      );
      // Crack overlay for 2-hp bricks
      if (hp === 2) {
        LJS.drawRect(bp, LJS.vec2(BRICK_W - 0.06, BRICK_H - 0.06), new LJS.Color(0, 0, 0, 0.25));
      }
    }
  }

  // ── Paddle ──────────────────────────────────────────────────────────────────
  const paddleColor = new LJS.Color(0.3, 0.7, 1.0);
  const paddlePos = LJS.vec2(paddleX, PADDLE_Y);
  LJS.drawRect(paddlePos, LJS.vec2(PADDLE_W, PADDLE_H), paddleColor);
  // Shine
  LJS.drawRect(
    LJS.vec2(paddleX, PADDLE_Y + PADDLE_H * 0.2),
    LJS.vec2(PADDLE_W * 0.8, PADDLE_H * 0.25),
    new LJS.Color(1, 1, 1, 0.3)
  );

  // ── Ball ────────────────────────────────────────────────────────────────────
  if (phase === "play" || phase === "start") {
    // Glow
    LJS.drawRect(ballPos, LJS.vec2(BALL_RADIUS * 3.5, BALL_RADIUS * 3.5), new LJS.Color(1, 1, 0.5, 0.12));
    // Ball
    LJS.drawRect(ballPos, LJS.vec2(BALL_RADIUS * 2, BALL_RADIUS * 2), new LJS.Color(1, 0.95, 0.4));
    // Highlight
    LJS.drawRect(
      LJS.vec2(ballPos.x - BALL_RADIUS * 0.25, ballPos.y + BALL_RADIUS * 0.25),
      LJS.vec2(BALL_RADIUS * 0.6, BALL_RADIUS * 0.6),
      new LJS.Color(1, 1, 1, 0.7)
    );
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────
  const hudY = WORLD_H / 2 - 0.8;
  LJS.drawText(`SCORE ${score}`, LJS.vec2(-5.5, hudY), 0.75, new LJS.Color(1, 1, 1));
  LJS.drawText(`BEST ${highScore}`, LJS.vec2(0, hudY), 0.75, new LJS.Color(1, 0.85, 0.3));
  LJS.drawText(`LV ${level}`, LJS.vec2(5.5, hudY), 0.75, new LJS.Color(0.6, 1, 0.7));

  // Lives
  for (let i = 0; i < LIVES_INIT; i++) {
    const col = i < lives ? new LJS.Color(1, 0.3, 0.3) : new LJS.Color(0.3, 0.3, 0.3);
    LJS.drawRect(LJS.vec2(-WORLD_W / 2 + 1 + i * 0.9, -WORLD_H / 2 + 0.7), LJS.vec2(0.55, 0.55), col);
  }

  // ── Overlay screens ──────────────────────────────────────────────────────────
  if (phase === "start") {
    // Dim
    LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(WORLD_W + 2, WORLD_H + 2), new LJS.Color(0, 0, 0, 0.55));
    LJS.drawText("BOOM BRICKS", LJS.vec2(0, 5), 1.6, new LJS.Color(1, 0.85, 0.15));
    LJS.drawText("Break all the bricks!", LJS.vec2(0, 2.5), 0.8, new LJS.Color(0.9, 0.9, 0.9));
    LJS.drawText("← → / A D  or  Mouse to move", LJS.vec2(0, 1.0), 0.6, new LJS.Color(0.7, 0.8, 1));
    LJS.drawText("SPACE or CLICK to launch", LJS.vec2(0, 0.0), 0.6, new LJS.Color(0.7, 0.8, 1));
    // Pulsing start button
    const pulse = 0.9 + 0.1 * Math.sin(LJS.time * 4);
    LJS.drawText("▶  CLICK TO START", LJS.vec2(0, -3), 0.9 * pulse, new LJS.Color(0.3, 1, 0.5));
    if (highScore > 0) {
      LJS.drawText(`Best: ${highScore}`, LJS.vec2(0, -5), 0.7, new LJS.Color(1, 0.85, 0.3));
    }
  }

  if (phase === "gameover") {
    LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(WORLD_W + 2, WORLD_H + 2), new LJS.Color(0, 0, 0, 0.65));
    LJS.drawText("GAME OVER", LJS.vec2(0, 4), 1.6, new LJS.Color(1, 0.25, 0.25));
    LJS.drawText(`Score: ${score}`, LJS.vec2(0, 1.8), 1.0, new LJS.Color(1, 1, 1));
    LJS.drawText(`Best:  ${highScore}`, LJS.vec2(0, 0.4), 0.85, new LJS.Color(1, 0.85, 0.3));
    const pulse = 0.9 + 0.1 * Math.sin(LJS.time * 4);
    LJS.drawText("▶  CLICK TO RESTART", LJS.vec2(0, -2.5), 0.9 * pulse, new LJS.Color(0.3, 1, 0.5));
  }

  if (phase === "win") {
    LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(WORLD_W + 2, WORLD_H + 2), new LJS.Color(0, 0, 0, 0.55));
    LJS.drawText("YOU WIN! 🎉", LJS.vec2(0, 4), 1.5, new LJS.Color(1, 0.85, 0.15));
    LJS.drawText(`Score: ${score}`, LJS.vec2(0, 1.8), 1.0, new LJS.Color(1, 1, 1));
    LJS.drawText(`Best:  ${highScore}`, LJS.vec2(0, 0.4), 0.85, new LJS.Color(1, 0.85, 0.3));
    const pulse = 0.9 + 0.1 * Math.sin(LJS.time * 4);
    LJS.drawText("▶  PLAY AGAIN", LJS.vec2(0, -2.5), 0.9 * pulse, new LJS.Color(0.3, 1, 0.5));
  }
}

function gameRenderPost() {}

// ─── React shell ──────────────────────────────────────────────────────────────
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || startedRef.current) return;
    startedRef.current = true;

    void LJS.engineInit(
      gameInit,
      gameUpdate,
      gameUpdatePost,
      gameRender,
      gameRenderPost,
      [],
      container
    );
  }, []);

  return (
    <Shell>
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px]"
        style={{ touchAction: "none" }}
      />
    </Shell>
  );
}
