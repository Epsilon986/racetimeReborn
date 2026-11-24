import { Track } from './track.ts';
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
  private toScreen = { scale: 1, x: 0, y: 0 };
  constructor(private host: HTMLElement, readonly track: Track) {
    this.canvas.className = 'race-canvas';
    this.canvas.setAttribute('aria-label', 'Farm River race circuit. Use the accelerator control below to race.');
    this.canvas.setAttribute('role', 'img');
    this.ctx = this.canvas.getContext('2d')!;
    host.append(this.canvas);
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
    const b = this.track.bounds;
    const scale = Math.min((this.width - 36) / b.width, (this.height - 110) / b.height);
    this.toScreen = { scale, x: (this.width - b.width * scale) / 2 - b.x * scale, y: (this.height - b.height * scale) / 2 - b.y * scale + 25 };
    this.drawTerrain();
  }
  private world(ctx: Context) {
    const { scale, x, y } = this.toScreen;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
  }
  private path(ctx: Context, lane: number) {
    ctx.beginPath();
    for (let i = 0; i < this.track.count; i++) {
      const p = this.track.point(i, lane);
      if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  private drawTerrain() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.terrain.width = Math.round(this.width * dpr);
    this.terrain.height = Math.round(this.height * dpr);
    const c = this.terrain.getContext('2d')!;
    c.scale(dpr, dpr);
    c.fillStyle = '#8fad78'; c.fillRect(0, 0, this.width, this.height);
    c.fillStyle = '#94b57d';
    for (let y = 0; y < this.height; y += 34) for (let x = 0; x < this.width; x += 34) if ((x / 34 + y / 34) % 2 === 0) c.fillRect(x, y, 34, 34);
    c.save(); this.world(c);
    const b = this.track.bounds;
    c.beginPath(); c.moveTo(b.x - 100, b.y + b.height * .47);
    c.bezierCurveTo(b.x + b.width * .25, b.y + b.height * .27, b.x + b.width * .7, b.y + b.height * .8, b.x + b.width + 100, b.y + b.height * .67);
    c.lineWidth = 160; c.strokeStyle = '#b9ca96'; c.stroke();
    c.lineWidth = 112; c.strokeStyle = '#609da1'; c.stroke();
    c.lineWidth = 4; c.strokeStyle = '#90bfc0'; c.setLineDash([25, 42]); c.stroke(); c.setLineDash([]);
    // Deterministic scenery, kept away from the road.
    let seed = 31017;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 170; i++) {
      const x = b.x + random() * b.width, y = b.y + random() * b.height;
      let near = false;
      for (let j = 0; j < this.track.count; j += 2) { const p = this.track.point(j); if (Math.hypot(x - p.x, y - p.y) < 170) { near = true; break; } }
      if (near) continue;
      const size = 25 + random() * 26;
      c.fillStyle = '#5b7d50'; c.beginPath(); c.ellipse(x + 12, y + 16, size * .9, size * .6, -.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5e885a'; c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#719b61'; c.beginPath(); c.arc(x - size * .2, y - size * .25, size * .72, 0, Math.PI * 2); c.fill();
    }
    // Track shoulder, curb, asphalt and lane markings.
    c.lineJoin = 'round'; c.lineCap = 'round';
    this.path(c, 1); c.strokeStyle = '#57744f'; c.lineWidth = 280; c.stroke();
    this.path(c, 1); c.strokeStyle = '#e7e4c9'; c.lineWidth = 255; c.stroke();
    c.strokeStyle = '#c46c53'; c.setLineDash([45, 45]); c.stroke(); c.setLineDash([]);
    this.path(c, 1); c.strokeStyle = '#414f4b'; c.lineWidth = 225; c.stroke();
    this.path(c, 1); c.strokeStyle = '#485651'; c.lineWidth = 207; c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#a8b4a0'; c.setLineDash([22, 22]);
    this.path(c, .5); c.stroke(); this.path(c, 1.5); c.stroke(); c.setLineDash([]);
    const p = this.track.point(0), h = this.track.heading(0);
    c.save(); c.translate(p.x, p.y); c.rotate(h);
    for (let row = 0; row < 2; row++) for (let cell = 0; cell < 10; cell++) { c.fillStyle = (cell + row) % 2 ? '#edf1db' : '#293831'; c.fillRect(row * 15 - 15, cell * 22.5 - 112.5, 15, 22.5); }
    c.restore();
    c.restore();
    c.fillStyle = '#28483b99'; c.font = '600 11px monospace'; c.fillText('FARM RIVER / SPRINT CIRCUIT', 20, this.height - 20);
  }
  draw(frame: Frame) {
    const c = this.texture?.context || this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    c.drawImage(this.terrain, 0, 0, this.width, this.height);
    c.save(); this.world(c);
    if (frame.ghost && frame.ghostVisible) this.car(c, frame.ghost, '#dce9e3', true, false);
    this.car(c, frame.player, '#f5de64', false, frame.held && frame.racing);
    c.restore();
    this.texture?.refresh();
  }
  private car(c: Context, state: RaceState, color: string, ghost: boolean, thrust: boolean) {
    const p = this.track.point(state.progress, state.lane);
    c.save(); c.translate(p.x, p.y); c.rotate(this.track.heading(state.progress, state.lane));
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
    if (!ghost) {
      c.save(); c.translate(p.x, p.y - 46); c.fillStyle = '#153d31';
      c.beginPath(); c.moveTo(-12, -9); c.lineTo(12, -9); c.lineTo(0, 3); c.closePath(); c.fill(); c.restore();
    }
  }
  destroy() { this.mounted = false; this.observer.disconnect(); this.phaser?.destroy(true); this.canvas.remove(); }
}
