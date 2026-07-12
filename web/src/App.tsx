import { useEffect, useRef } from "react";
import * as LJS from "littlejsengine";
import { Shell } from "./components/Shell";

// ─── Constants ────────────────────────────────────────────────────────────────
const WORLD_W = 20;
const WORLD_H = 28;
const BRICK_COLS = 10;
const BRICK_ROWS = 7;
const BRICK_W = 1.7;
const BRICK_H = 0.7;
const BRICK_GAP = 0.08;
const PADDLE_W = 3.2;
const PADDLE_H = 0.45;
const PADDLE_Y = -11.5;
const BALL_RADIUS = 0.28;
const BALL_SPEED = 14;
const MAX_LIVES = 3;
const HS_KEY = "boombricks_highscore";

// ─── Sounds (ZzFX arrays) ─────────────────────────────────────────────────────
// bounce off paddle / wall
const sndBounce = new LJS.Sound([1, 0, 300, , 0.04, 0.02, 0, 1.5, , , , , , 0.5]);
// brick break
const sndBreak = new LJS.Sound([1, 0.1, 800, , 0.02, 0.15, 3, 1.8, , , , , , , , 0.2]);
// lose a life / ball fall
const sndLose = new LJS.Sound([1, 0.3, 150, 0.2, 0.1, 0.4, 1, 0.5, , , -200, , , , , 0.3]);
// level clear
const sndClear = new LJS.Sound([1, 0, 600, , 0.05, 0.3, 0, 1, , 8, 300, 0.06, , , , , 0.5]);
// game start
const sndStart = new LJS.Sound([1, 0, 400, , 0.04, 0.2, 0, 2, , 5, 200, 0.05]);

// ─── Brick row colours ────────────────────────────────────────────────────────
const ROW_COLORS = [
  new LJS.Color(1.0, 0.25, 0.25), // red
  new LJS.Color(1.0, 0.55, 0.1),  // orange
  new LJS.Color(1.0, 0.9, 0.1),   // yellow
  new LJS.Color(0.25, 0.85, 0.35),// green
  new LJS.Color(0.2, 0.7, 1.0),   // blue
  new LJS.Color(0.6, 0.3, 1.0),   // purple
  new LJS.Color(1.0, 0.35, 0.8),  // pink
];

// ─── Game state ───────────────────────────────────────────────────────────────
type Phase = "start" | "playing" | "paused" | "dead" | "over";

interface GameState {
  phase: Phase;
  score: number;
  lives: number;
  highScore: number;
  level: number;
  bricks: BrickObj[];
  ball: BallObj | null;
  paddle: PaddleObj | null;
  ballLaunched: boolean;
}

// We keep a single mutable state object updated each frame
const G: GameState = {
  phase: "start",
  score: 0,
  lives: MAX_LIVES,
  highScore: 0,
  level: 1,
  bricks: [],
  ball: null,
  paddle: null,
  ballLaunched: false,
};

// ─── Brick ────────────────────────────────────────────────────────────────────
class BrickObj extends LJS.EngineObject {
  hp: number;
  maxHp: number;
  col: LJS.Color;

  constructor(pos: LJS.Vector2, hp: number, col: LJS.Color) {
    super(pos, LJS.vec2(BRICK_W, BRICK_H));
    this.hp = hp;
    this.maxHp = hp;
    this.col = col;
    this.setCollision(true, false);
    this.mass = 0; // static
  }

  render() {
    const brightness = 0.6 + 0.4 * (this.hp / this.maxHp);
    const c = this.col.scale(brightness, false);
    LJS.drawRect(this.pos, this.size, c);
    // highlight edge
    LJS.drawRect(
      this.pos.add(LJS.vec2(-BRICK_W * 0.5 + 0.06, BRICK_H * 0.5 - 0.06)),
      LJS.vec2(BRICK_W - 0.12, 0.06),
      new LJS.Color(1, 1, 1, 0.35),
    );
    if (this.maxHp > 1) {
      LJS.drawText(String(this.hp), this.pos, 0.4, new LJS.Color(1, 1, 1, 0.9));
    }
  }

  hit() {
    this.hp -= 1;
    // flash
    this.col = this.col.lerp(new LJS.Color(1, 1, 1), 0.4);
    if (this.hp <= 0) {
      this.explode();
      this.destroy();
      return true;
    }
    sndBreak.play(this.pos, 0.5);
    return false;
  }

  explode() {
    sndBreak.play(this.pos, 1);
    new LJS.ParticleEmitter(
      this.pos, 0,           // pos, angle
      0.5, 0,               // emitSize, emitTime (0 = burst)
      60, Math.PI * 2,      // emitRate, emitConeAngle
      undefined,            // tileInfo
      this.col, this.col.scale(0.5, false), // colorStartA, colorStartB
      new LJS.Color(this.col.r, this.col.g, this.col.b, 0),
      new LJS.Color(this.col.r * 0.5, this.col.g * 0.5, this.col.b * 0.5, 0),
      0.5, 0.15, 0.8, 0.2, 0.1, // particleTime, sizeStart, sizeEnd, speed, angleSpeed
      1, 1, 0.3,            // damping, angleDamping, gravityScale
      0, 0.5,               // particleConeAngle, fadeRate
      0.5, false, true,     // randomness, collide, additive
    );
  }
}

// ─── Paddle ───────────────────────────────────────────────────────────────────
class PaddleObj extends LJS.EngineObject {
  targetX: number;

  constructor() {
    super(LJS.vec2(0, PADDLE_Y), LJS.vec2(PADDLE_W, PADDLE_H));
    this.setCollision(true, false);
    this.mass = 0;
    this.targetX = 0;
  }

  update() {
    // Mouse / touch
    this.targetX = LJS.mousePos.x;

    // Keyboard
    const speed = 18 * LJS.timeDelta;
    if (LJS.keyIsDown("ArrowLeft") || LJS.keyIsDown("KeyA")) this.targetX -= speed * 60 * LJS.timeDelta;
    if (LJS.keyIsDown("ArrowRight") || LJS.keyIsDown("KeyD")) this.targetX += speed * 60 * LJS.timeDelta;

    // Clamp to world
    const half = WORLD_W / 2 - PADDLE_W / 2;
    this.targetX = LJS.clamp(this.targetX, -half, half);

    // Smooth follow
    this.pos.x += (this.targetX - this.pos.x) * 0.25;
    this.pos.x = LJS.clamp(this.pos.x, -half, half);
  }

  render() {
    // Pill-shaped paddle
    const grad = new LJS.Color(0.4, 0.85, 1.0);
    LJS.drawRect(this.pos, this.size, grad);
    // shine strip
    LJS.drawRect(
      this.pos.add(LJS.vec2(0, PADDLE_H * 0.2)),
      LJS.vec2(PADDLE_W - 0.2, 0.1),
      new LJS.Color(1, 1, 1, 0.4),
    );
  }
}

// ─── Ball ─────────────────────────────────────────────────────────────────────
class BallObj extends LJS.EngineObject {
  speed: number;
  trail: LJS.Vector2[];

  constructor(pos: LJS.Vector2) {
    super(pos, LJS.vec2(BALL_RADIUS * 2, BALL_RADIUS * 2));
    this.speed = BALL_SPEED + (G.level - 1) * 1.5;
    this.velocity = LJS.vec2(0, 0);
    this.setCollision(true, true);
    this.mass = 1;
    this.elasticity = 1;
    this.friction = 0;
    this.gravityScale = 0;
    this.trail = [];
  }

  launch() {
    const angle = LJS.PI / 2 + (Math.random() - 0.5) * 0.8;
    this.velocity = LJS.vec2(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
  }

  update() {
    // Record trail
    this.trail.push(this.pos.copy());
    if (this.trail.length > 8) this.trail.shift();

    // Wall bounce (left/right/top)
    const halfW = WORLD_W / 2 - BALL_RADIUS;
    if (this.pos.x < -halfW) { this.pos.x = -halfW; this.velocity.x = Math.abs(this.velocity.x); sndBounce.play(this.pos, 0.4); }
    if (this.pos.x > halfW)  { this.pos.x = halfW;  this.velocity.x = -Math.abs(this.velocity.x); sndBounce.play(this.pos, 0.4); }
    const halfH = WORLD_H / 2 - BALL_RADIUS;
    if (this.pos.y > halfH)  { this.pos.y = halfH;  this.velocity.y = -Math.abs(this.velocity.y); sndBounce.play(this.pos, 0.4); }

    // Normalise speed (prevent drift)
    const spd = this.velocity.length();
    if (spd > 0.01) this.velocity = this.velocity.scale(this.speed / spd);

    // Move manually (no gravity)
    this.pos = this.pos.add(this.velocity.scale(LJS.timeDelta));

    // Paddle collision
    const paddle = G.paddle;
    if (paddle && this.velocity.y < 0) {
      const dx = Math.abs(this.pos.x - paddle.pos.x);
      const dy = Math.abs(this.pos.y - paddle.pos.y);
      if (dx < PADDLE_W / 2 + BALL_RADIUS && dy < PADDLE_H / 2 + BALL_RADIUS) {
        // Reflect & add angle based on hit position
        const offset = (this.pos.x - paddle.pos.x) / (PADDLE_W / 2);
        const angle = LJS.PI / 2 + offset * 1.1;
        this.velocity = LJS.vec2(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
        this.pos.y = paddle.pos.y + PADDLE_H / 2 + BALL_RADIUS + 0.01;
        sndBounce.play(this.pos, 0.6);
        // Tiny sparkle on paddle hit
        new LJS.ParticleEmitter(
          this.pos, 0, 0.1, 0, 20, Math.PI,
          undefined,
          new LJS.Color(0.5, 0.9, 1, 1), new LJS.Color(0.3, 0.7, 1, 1),
          new LJS.Color(0.5, 0.9, 1, 0), new LJS.Color(0.3, 0.7, 1, 0),
          0.2, 0.1, 0, 0.3, 0.1,
          1, 1, 0, 0, 0.8, 0.3, false, true,
        );
      }
    }

    // Brick collision
    for (let i = G.bricks.length - 1; i >= 0; i--) {
      const brick = G.bricks[i];
      if (!brick) continue;
      const dx = Math.abs(this.pos.x - brick.pos.x);
      const dy = Math.abs(this.pos.y - brick.pos.y);
      const overlapX = BRICK_W / 2 + BALL_RADIUS - dx;
      const overlapY = BRICK_H / 2 + BALL_RADIUS - dy;
      if (overlapX > 0 && overlapY > 0) {
        const destroyed = brick.hit();
        if (destroyed) {
          G.bricks.splice(i, 1);
          const pts = brick.maxHp * 10;
          G.score += pts;
          if (G.score > G.highScore) {
            G.highScore = G.score;
            localStorage.setItem(HS_KEY, String(G.highScore));
          }
          // Score popup
          new LJS.ParticleEmitter(
            brick.pos, 0, 0, 0, 1, 0,
            undefined,
            new LJS.Color(1, 1, 0.5, 1), new LJS.Color(1, 1, 0.5, 1),
            new LJS.Color(1, 1, 0.5, 0), new LJS.Color(1, 1, 0.5, 0),
            0.6, 0.35, 0, 0.05, 0,
            1, 1, -0.5,
          );
        }
        // Bounce direction
        if (overlapX < overlapY) {
          this.velocity.x *= -1;
          this.pos.x += overlapX * Math.sign(this.pos.x - brick.pos.x);
        } else {
          this.velocity.y *= -1;
          this.pos.y += overlapY * Math.sign(this.pos.y - brick.pos.y);
        }
        break;
      }
    }

    // Ball fell below paddle
    if (this.pos.y < -WORLD_H / 2 - 2) {
      this.destroy();
      G.ball = null;
      G.lives -= 1;
      sndLose.play();
      if (G.lives <= 0) {
        G.phase = "over";
      } else {
        G.phase = "dead";
      }
    }
  }

  render() {
    // Draw trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = i / this.trail.length;
      const pt = this.trail[i];
      if (!pt) continue;
      LJS.drawRect(
        pt,
        LJS.vec2(BALL_RADIUS * 2 * t * 0.7),
        new LJS.Color(1, 0.8, 0.3, t * 0.4),
      );
    }
    // Ball
    LJS.drawRect(this.pos, LJS.vec2(BALL_RADIUS * 2), new LJS.Color(1, 0.95, 0.5));
    // Shine
    LJS.drawRect(
      this.pos.add(LJS.vec2(-BALL_RADIUS * 0.3, BALL_RADIUS * 0.3)),
      LJS.vec2(BALL_RADIUS * 0.6),
      new LJS.Color(1, 1, 1, 0.8),
    );
  }
}

// ─── Level builder ────────────────────────────────────────────────────────────
function buildLevel(level: number) {
  // Destroy old bricks
  for (const b of G.bricks) b.destroy();
  G.bricks = [];

  const startX = -(BRICK_COLS / 2) * (BRICK_W + BRICK_GAP) + (BRICK_W + BRICK_GAP) / 2;
  const startY = WORLD_H / 2 - 4;

  for (let row = 0; row < BRICK_ROWS; row++) {
    const hp = row < 2 ? 1 : row < 5 ? (level >= 3 ? 2 : 1) : level >= 2 ? 3 : 2;
    const col = ROW_COLORS[row % ROW_COLORS.length] ?? ROW_COLORS[0]!;
    for (let c = 0; c < BRICK_COLS; c++) {
      const x = startX + c * (BRICK_W + BRICK_GAP);
      const y = startY - row * (BRICK_H + BRICK_GAP);
      const brick = new BrickObj(LJS.vec2(x, y), hp, col.copy());
      G.bricks.push(brick);
    }
  }
}

function spawnBall() {
  if (G.ball) { G.ball.destroy(); G.ball = null; }
  const paddle = G.paddle;
  const startY = paddle ? paddle.pos.y + PADDLE_H / 2 + BALL_RADIUS + 0.1 : PADDLE_Y + 2;
  const startX = paddle ? paddle.pos.x : 0;
  G.ball = new BallObj(LJS.vec2(startX, startY));
  G.ballLaunched = false;
}

function startGame(level = 1) {
  G.phase = "playing";
  G.score = 0;
  G.lives = MAX_LIVES;
  G.level = level;
  G.ballLaunched = false;
  buildLevel(level);
  spawnBall();
  sndStart.play();
}

function nextLevel() {
  G.level += 1;
  buildLevel(G.level);
  spawnBall();
  sndClear.play();
}

// ─── HUD drawing ─────────────────────────────────────────────────────────────
function drawHUD() {
  const top = WORLD_H / 2 - 0.8;

  // Score (left)
  LJS.drawText(`${G.score}`, LJS.vec2(-WORLD_W / 2 + 3, top), 0.75, new LJS.Color(1, 1, 1, 0.95));

  // Lives (center)
  for (let i = 0; i < MAX_LIVES; i++) {
    const alive = i < G.lives;
    LJS.drawRect(
      LJS.vec2(-0.7 + i * 0.7, top),
      LJS.vec2(0.45, 0.45),
      alive ? new LJS.Color(1, 0.4, 0.4) : new LJS.Color(0.3, 0.3, 0.3, 0.5),
    );
  }

  // High score (right)
  LJS.drawText(`HI ${G.highScore}`, LJS.vec2(WORLD_W / 2 - 3, top), 0.6, new LJS.Color(1, 0.9, 0.4, 0.85));

  // Level
  LJS.drawText(`LV ${G.level}`, LJS.vec2(WORLD_W / 2 - 3, top - 1.0), 0.55, new LJS.Color(0.7, 0.9, 1, 0.7));
}

function drawStartScreen() {
  // Dark overlay
  LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(WORLD_W, WORLD_H), new LJS.Color(0, 0, 0.05, 0.78));

  LJS.drawText("BOOM BRICKS", LJS.vec2(0, 5), 1.6, new LJS.Color(1, 0.9, 0.2));
  LJS.drawText("Break all the bricks!", LJS.vec2(0, 2.8), 0.75, new LJS.Color(0.8, 0.9, 1));
  LJS.drawText("TAP or SPACE to launch", LJS.vec2(0, 1.2), 0.65, new LJS.Color(0.7, 1, 0.7));
  LJS.drawText("← → or mouse to move paddle", LJS.vec2(0, 0.3), 0.6, new LJS.Color(0.7, 0.85, 1));
  LJS.drawText("▶  TAP TO START", LJS.vec2(0, -2), 0.85, new LJS.Color(1, 0.5, 0.3));

  if (G.highScore > 0) {
    LJS.drawText(`Best: ${G.highScore}`, LJS.vec2(0, -3.5), 0.65, new LJS.Color(1, 0.9, 0.4));
  }
}

function drawDeadScreen() {
  LJS.drawRect(LJS.vec2(0, -5), LJS.vec2(WORLD_W * 0.7, 4), new LJS.Color(0, 0, 0, 0.7));
  LJS.drawText(`OOPS! ${G.lives} left`, LJS.vec2(0, -4), 0.85, new LJS.Color(1, 0.5, 0.3));
  LJS.drawText("TAP or SPACE to continue", LJS.vec2(0, -5.5), 0.6, new LJS.Color(0.8, 0.9, 1));
}

function drawGameOverScreen() {
  LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(WORLD_W, WORLD_H), new LJS.Color(0, 0, 0.05, 0.82));
  LJS.drawText("GAME OVER", LJS.vec2(0, 4), 1.5, new LJS.Color(1, 0.3, 0.3));
  LJS.drawText(`Score: ${G.score}`, LJS.vec2(0, 1.8), 0.85, new LJS.Color(1, 1, 0.5));
  LJS.drawText(`Best: ${G.highScore}`, LJS.vec2(0, 0.6), 0.72, new LJS.Color(1, 0.9, 0.4));
  if (G.score >= G.highScore && G.score > 0) {
    LJS.drawText("🏆 NEW HIGH SCORE!", LJS.vec2(0, -0.6), 0.75, new LJS.Color(1, 0.85, 0.1));
  }
  LJS.drawText("▶  TAP TO PLAY AGAIN", LJS.vec2(0, -2.5), 0.85, new LJS.Color(0.4, 1, 0.6));
}

// ─── React component ──────────────────────────────────────────────────────────
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || startedRef.current) return;
    startedRef.current = true;

    // Load high score
    G.highScore = parseInt(localStorage.getItem(HS_KEY) ?? "0", 10) || 0;

    // ── gameInit ──────────────────────────────────────────────────────────────
    function gameInit() {
      LJS.setCameraPos(LJS.vec2(0, 0));
      LJS.setCameraScale(32);

      // Create paddle (persists through game)
      G.paddle = new PaddleObj();

      // Draw some decorative bricks on start screen
      buildLevel(1);
    }

    // ── gameUpdate ────────────────────────────────────────────────────────────
    function gameUpdate() {
      const pressed =
        LJS.mouseWasPressed(0) ||
        LJS.keyWasPressed("Space") ||
        LJS.keyWasPressed("Enter");

      switch (G.phase) {
        case "start":
          if (pressed) startGame(1);
          break;

        case "playing": {
          // Launch ball on tap/space
          if (!G.ballLaunched && pressed) {
            G.ballLaunched = true;
            G.ball?.launch();
          }
          // Keep ball on paddle before launch
          if (!G.ballLaunched && G.ball && G.paddle) {
            G.ball.pos.x = G.paddle.pos.x;
            G.ball.pos.y = G.paddle.pos.y + PADDLE_H / 2 + BALL_RADIUS + 0.1;
          }
          // Level clear
          if (G.bricks.length === 0) {
            sndClear.play();
            nextLevel();
          }
          break;
        }

        case "dead":
          if (pressed) {
            spawnBall();
            G.phase = "playing";
          }
          break;

        case "over":
          if (pressed) startGame(1);
          break;
      }
    }

    // ── gameUpdatePost ────────────────────────────────────────────────────────
    function gameUpdatePost() {}

    // ── gameRender ────────────────────────────────────────────────────────────
    function gameRender() {
      // Background gradient feel — dark navy
      LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(WORLD_W + 2, WORLD_H + 2), new LJS.Color(0.04, 0.04, 0.12));

      // Subtle grid lines
      for (let x = -WORLD_W / 2; x <= WORLD_W / 2; x += 2) {
        LJS.drawRect(LJS.vec2(x, 0), LJS.vec2(0.02, WORLD_H), new LJS.Color(1, 1, 1, 0.03));
      }

      // Wall borders
      const wallColor = new LJS.Color(0.2, 0.25, 0.45);
      LJS.drawRect(LJS.vec2(-WORLD_W / 2 - 0.25, 0), LJS.vec2(0.5, WORLD_H), wallColor);
      LJS.drawRect(LJS.vec2(WORLD_W / 2 + 0.25, 0), LJS.vec2(0.5, WORLD_H), wallColor);
      LJS.drawRect(LJS.vec2(0, WORLD_H / 2 + 0.25), LJS.vec2(WORLD_W + 1, 0.5), wallColor);

      // Danger zone line
      LJS.drawRect(LJS.vec2(0, PADDLE_Y - 1.0), LJS.vec2(WORLD_W, 0.04), new LJS.Color(1, 0.2, 0.2, 0.25));

      // HUD always visible
      if (G.phase !== "start") drawHUD();

      // Overlays
      if (G.phase === "start") drawStartScreen();
      if (G.phase === "dead") drawDeadScreen();
      if (G.phase === "over") drawGameOverScreen();
    }

    // ── gameRenderPost ────────────────────────────────────────────────────────
    function gameRenderPost() {}

    void LJS.engineInit(
      gameInit,
      gameUpdate,
      gameUpdatePost,
      gameRender,
      gameRenderPost,
      [],
      container,
    );
  }, []);

  return (
    <Shell>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ touchAction: "none", userSelect: "none" }}
      />
    </Shell>
  );
}
