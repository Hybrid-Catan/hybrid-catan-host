
export interface Point { x: number; y: number; }

const CORNER_MARKERS: Record<number, { innerCorner: number }> = {
  0: { innerCorner: 2 },
  2: { innerCorner: 3 },
  5: { innerCorner: 1 },
  7: { innerCorner: 0 },
};

const WARP_W = 594;
const WARP_H = 924;


export function getCornerPoint(cv: any, cornerMat: any, index: number): Point {
  return {
    x: cornerMat.floatAt(0, index * 2),
    y: cornerMat.floatAt(0, index * 2 + 1),
  };
}


export function findHomographyPoints(cv: any, ids: any, corners: any): [Point, Point, Point, Point] | null {
  const found: Record<number, Point> = {};
  for (let i = 0; i < ids.rows; i++) {
    const id = ids.intPtr(i, 0)[0];
    if (id in CORNER_MARKERS) {
      const mat = corners.get(i);
      found[id] = getCornerPoint(cv, mat, CORNER_MARKERS[id].innerCorner);
      mat.delete();
    }
  }
  if (!(0 in found && 2 in found && 5 in found && 7 in found)) return null;
  return [found[0], found[2], found[5], found[7]];
}


export function applyHomography(cv: any, src: any, srcPoints: [Point, Point, Point, Point], warpCanvas: HTMLCanvasElement): void {
  const [tl, tr, bl, br] = srcPoints;
  const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y]);
  const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, WARP_W, 0, 0, WARP_H, WARP_W, WARP_H]);

  const H = cv.findHomography(srcMat, dstMat);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, new cv.Size(WARP_W, WARP_H), H);

  cv.imshow(warpCanvas, warped);

  [srcMat, dstMat, H, warped].forEach(m => m.delete());
}