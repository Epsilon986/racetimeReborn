import { Track, TRACK_EDGES, clamp } from './track.ts';
import { FollowCamera } from './camera.ts';
import type { RaceState } from './simulation.ts';

export type Frame = { player: RaceState; ghost: RaceState | null; ghostVisible: boolean; held: boolean; racing: boolean };
type Context = CanvasRenderingContext2D;
type CanvasTexture = { context: Context; refresh(): void; setSize(w: number, h: number): void };
type ImageObject = { setOrigin(x: number, y?: number): ImageObject; setDisplaySize(w: number, h: number): ImageObject };
type PhaserScene = { textures: { createCanvas(key: string, w: number, h: number): CanvasTexture }; add: { image(x: number, y: number, texture: string): ImageObject } };
type PhaserGame = { destroy(removeCanvas: boolean): void; scale: { resize(w: number, h: number): void } };
type PhaserRuntime = { AUTO: number; Game: new (config: object) => PhaserGame };
declare global { interface Window { Phaser?: PhaserRuntime } }

export class RaceRenderer {
  private canvas = document.createElement('canvas');
  private ctx: Context;
  private width = 1;
  private height = 1;
  private terrain = document.createElement('canvas');
  private phaser?: PhaserGame;
  private texture?: CanvasTexture;
  private image?: ImageObject;
  private mounted = true;
  private observer: ResizeObserver;
  private camera = new FollowCamera();
  private terrainBounds: { x: number; y: number; width: number; height: number };
  private laneBands: Path2D[] = [];
  private laneLines: Path2D[] = [];
  private walls: Path2D[] = [];
  private curbs: Path2D[] = [];
  constructor(private host: HTMLElement, readonly track: Track) {
    this.canvas.className = 'race-canvas';
    this.canvas.setAttribute('aria-label', 'Farm River race circuit. Hold to accelerate and release to turn.');
    this.canvas.setAttribute('role', 'img');
    this.ctx = this.canvas.getContext('2d')!;
    host.append(this.canvas);
    const b = track.bounds;
    this.terrainBounds = { x: b.x - 500, y: b.y - 500, width: b.width + 1000, height: b.height + 1000 };
    this.laneBands = [this.ribbon(-0.5, 0.5), this.ribbon(0.5, 1.5), this.ribbon(1.5, 2.5)];
    this.laneLines = [this.path(0.5), this.path(1.5)];
    this.walls = TRACK_EDGES.map(lane => this.path(lane));
    this.curbs = [this.path(-0.61), this.path(2.61)];
    this.drawTerrain();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.loadPhaser();
  }
  private loadPhaser() {
    const boot = () => {
      if (!this.mounted || !window.Phaser || this.phaser) return;
      const owner = this;
      try {
        this.phaser = new window.Phaser.Game({
          type: window.Phaser.AUTO, parent: this.host, width: this.width, height: this.height,
          backgroundColor: '#8baf79', transparent: false, banner: false,
          audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false },
          scene: {
            create(this: PhaserScene) {
              if (!owner.mounted) return;
              owner.texture = this.textures.createCanvas('race-surface', owner.width, owner.height);
              owner.image = this.add.image(0, 0, 'race-surface').setOrigin(0);
              owner.canvas.hidden = true;
            },
          },
        });
      } catch {
        this.phaser?.destroy(true);
        this.phaser = undefined;
        this.texture = undefined;
        this.canvas.hidden = false;
      }
    };
    if (window.Phaser) { boot(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js';
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = boot;
    script.onerror = () => { /* The fully playable Canvas renderer remains active. */ };
    document.head.append(script);
  }
  private resize() {
    this.width = Math.max(1, Math.round(this.host.clientWidth));
    this.height = Math.max(1, Math.round(this.host.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.phaser?.scale.resize(this.width, this.height);
    this.texture?.setSize(this.width, this.height);
    this.image?.setDisplaySize(this.width, this.height);
    this.camera.resize(this.width, this.height);
  }
  private world(ctx: Context) {
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.camera.scale, this.camera.scale);
    ctx.translate(-this.camera.x, -this.camera.y);
  }
  private path(lane: number) {
    const path = new Path2D();
    for (let i = 0; i < this.track.count; i++) {
      const p = this.track.point(i, lane);
      if (!i) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y);
    }
    path.closePath();
    return path;
  }
  private ribbon(left: number, right: number) {
    // One ring formed by traversing one edge forward and the other backward.
    const band = new Path2D();
    for (let i = 0; i < this.track.count; i++) {
      const p = this.track.point(i, left);
      if (!i) band.moveTo(p.x, p.y); else band.lineTo(p.x, p.y);
    }
    const startLeft = this.track.point(0, left);
    band.lineTo(startLeft.x, startLeft.y);
    const startRight = this.track.point(0, right);
    band.lineTo(startRight.x, startRight.y);
    for (let i = this.track.count - 1; i >= 0; i--) {
      const p = this.track.point(i, right);
      band.lineTo(p.x, p.y);
    }
    band.closePath();
    return band;
  }
  private drawTerrain() {
    const b = this.terrainBounds;
    const resolution = 0.7;
    this.terrain.width = Math.ceil(b.width * resolution);
    this.terrain.height = Math.ceil(b.height * resolution);
    const c = this.terrain.getContext('2d')!;
    c.scale(this.terrain.width / b.width, this.terrain.height / b.height);
    c.translate(-b.x, -b.y);
    c.fillStyle = '#8fad78'; c.fillRect(b.x, b.y, b.width, b.height);
    c.beginPath(); c.moveTo(b.x - 100, b.y + b.height * .47);
    c.bezierCurveTo(b.x + b.width * .25, b.y + b.height * .27, b.x + b.width * .7, b.y + b.height * .8, b.x + b.width + 100, b.y + b.height * .67);
    c.lineWidth = 160; c.strokeStyle = '#b9ca96'; c.stroke();
    c.lineWidth = 112; c.strokeStyle = '#609da1'; c.stroke();
    c.lineWidth = 4; c.strokeStyle = '#90bfc0'; c.setLineDash([25, 42]); c.stroke(); c.setLineDash([]);
    // Deterministic scenery, kept away from the road.
    let seed = 31017;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 120; i++) {
      const x = b.x + random() * b.width, y = b.y + random() * b.height;
      let near = false;
      for (let j = 0; j < this.track.count; j += 2) { const p = this.track.point(j); if (Math.hypot(x - p.x, y - p.y) < 170) { near = true; break; } }
      if (near) continue;
      const size = 25 + random() * 26;
      c.fillStyle = '#5b7d50'; c.beginPath(); c.ellipse(x + 12, y + 16, size * .9, size * .6, -.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5e885a'; c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#719b61'; c.beginPath(); c.arc(x - size * .2, y - size * .25, size * .72, 0, Math.PI * 2); c.fill();
    }
  }
  private drawRoad(c: Context) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const path of this.curbs) {
      c.lineWidth = 18; c.strokeStyle = '#e5e4cc'; c.stroke(path);
      c.strokeStyle = '#b96c56'; c.setLineDash([30, 30]); c.stroke(path); c.setLineDash([]);
    }
    for (let lane = 0; lane < 3; lane++) {
      c.fillStyle = lane === 1 ? '#505d58' : '#46534f';
      c.fill(this.laneBands[lane], 'evenodd');
    }
    // The asphalt ends at the same two boundaries used by the simulation.
    c.strokeStyle = '#253b32'; c.lineWidth = 7;
    for (const wall of this.walls) c.stroke(wall);
    c.strokeStyle = '#e0e3cc'; c.lineWidth = 3;
    for (const line of this.laneLines) c.stroke(line);
    const p = this.track.point(0), h = this.track.heading(0);
    const halfRoad = this.track.corner(0).width * 1.5;
    c.save(); c.translate(p.x, p.y); c.rotate(h);
    for (let row = 0; row < 2; row++) for (let cell = 0; cell < 12; cell++) { c.fillStyle = (cell + row) % 2 ? '#edf1db' : '#293831'; c.fillRect(row * 12 - 12, cell * halfRoad / 6 - halfRoad, 12, halfRoad / 6); }
    c.restore();
  }
  resetFollow(state: RaceState) { this.camera.follow(this.track, state, 0, true); }
  draw(frame: Frame, dt = 1 / 60) {
    this.camera.follow(this.track, frame.player, dt);
    const c = this.texture?.context || this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = '#8fad78'; c.fillRect(0, 0, this.width, this.height);
    c.save(); this.world(c);
    const b = this.terrainBounds;
    c.drawImage(this.terrain, b.x, b.y, b.width, b.height);
    this.drawRoad(c);
    if (frame.ghost && frame.ghostVisible) this.car(c, frame.ghost, '#dce9e3', true, false);
    this.car(c, frame.player, '#f5de64', false, frame.held && frame.racing);
    c.restore();
    this.texture?.refresh();
  }
  private car(c: Context, state: RaceState, color: string, ghost: boolean, thrust: boolean) {
    const p = this.track.point(state.progress, state.lane);
    const corner = this.track.corner(state.progress);
    const slip = clamp(Math.atan2(state.lateralSpeed * corner.width * corner.orientation, Math.max(80, state.speed)), -0.5, 0.5);
    c.save(); c.translate(p.x, p.y); c.rotate(this.track.heading(state.progress, state.lane) + slip); c.scale(0.72, 0.72);
    if (ghost) c.globalAlpha = .42;
    if (thrust) { c.fillStyle = '#f7e5a9'; c.beginPath(); c.moveTo(-30, -10); c.lineTo(-48 - (state.tick % 7) * 2, 0); c.lineTo(-30, 10); c.fill(); }
    c.fillStyle = '#22382c66'; c.beginPath(); c.roundRect(-27, -14, 63, 39, 9); c.fill();
    c.fillStyle = '#22312c'; for (const x of [-17, 15]) for (const y of [-23, 14]) c.fillRect(x - 6, y, 12, 10);
    c.fillStyle = state.contactFlash ? '#f79469' : color; c.beginPath(); c.roundRect(-31, -17, 66, 34, 10); c.fill();
    c.fillStyle = '#273d36'; c.beginPath(); c.roundRect(-6, -13, 22, 26, 6); c.fill();
    c.fillStyle = '#88aaa0'; c.fillRect(9, -10, 5, 20);
    c.fillStyle = '#fff5c8'; c.fillRect(29, -12, 4, 7); c.fillRect(29, 5, 4, 7);
    c.strokeStyle = ghost ? '#ffffff' : '#e6c858'; c.lineWidth = 2; c.strokeRect(-28, -20, 7, 40);
    c.restore();
  }
  destroy() { this.mounted = false; this.observer.disconnect(); this.phaser?.destroy(true); this.canvas.remove(); }
}
