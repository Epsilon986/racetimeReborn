export type Point = { x: number; y: number };
export type TrackData = { id: string; name: string; lanes: number[][][] };
// Lane centers are 0, 1 and 2. Each wall sits a quarter lane width beyond the outer half-lane.
export const TRACK_EDGES = [-0.75, 2.75] as const;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Track {
  readonly data: TrackData;
  readonly count: number;
  readonly lengths: number[][];
  readonly totalLength: number;
  readonly bounds: { x: number; y: number; width: number; height: number };
  constructor(data: TrackData) {
    if (data.lanes.length !== 3 || data.lanes.some(l => l.length !== data.lanes[0].length)) throw new Error('Track needs three matching lanes');
    this.data = data;
    this.count = data.lanes[0].length;
    this.lengths = data.lanes.map(l => l.map((p, i) => Math.hypot(p[0] - l[(i + 1) % l.length][0], p[1] - l[(i + 1) % l.length][1])));
    this.totalLength = this.lengths[1].reduce((a, b) => a + b, 0);
    const points = data.lanes.flat();
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    this.bounds = { x: Math.min(...xs) - 180, y: Math.min(...ys) - 180, width: Math.max(...xs) - Math.min(...xs) + 360, height: Math.max(...ys) - Math.min(...ys) + 360 };
  }
  point(progress: number, lane = 1): Point {
    const wrapped = ((progress % this.count) + this.count) % this.count;
    const i = Math.floor(wrapped), t = wrapped - i, j = (i + 1) % this.count;
    const low = clamp(Math.floor(lane), 0, 1), high = low + 1, mix = lane - low;
    const a = this.data.lanes[low], b = this.data.lanes[high];
    return { x: lerp(lerp(a[i][0], a[j][0], t), lerp(b[i][0], b[j][0], t), mix), y: lerp(lerp(a[i][1], a[j][1], t), lerp(b[i][1], b[j][1], t), mix) };
  }
  segmentLength(progress: number, lane: number) {
    const i = ((Math.floor(progress) % this.count) + this.count) % this.count;
    const low = clamp(Math.floor(lane), 0, 1);
    return lerp(this.lengths[low][i], this.lengths[low + 1][i], lane - low);
  }
  heading(progress: number, lane = 1) {
    const a = this.point(progress - 0.35, lane), b = this.point(progress + 0.35, lane);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  corner(progress: number) {
    const a = this.heading(progress - 0.7), b = this.heading(progress + 0.7);
    const curvature = angleDifference(b, a) / Math.max(1, this.segmentLength(progress, 1) * 1.4);
    const p = this.point(progress, 0), q = this.point(progress, 2), h = this.heading(progress);
    const orientation = Math.sign((q.x - p.x) * -Math.sin(h) + (q.y - p.y) * Math.cos(h)) || 1;
    return { curvature, orientation, width: Math.hypot(q.x - p.x, q.y - p.y) / 2 };
  }
  laneLimits(progress: number, halfWidth: number) {
    const clearance = halfWidth / Math.max(1, this.corner(progress).width);
    return { min: TRACK_EDGES[0] + clearance, max: TRACK_EDGES[1] - clearance };
  }
}
