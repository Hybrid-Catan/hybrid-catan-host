declare const cv: any;


// --- Grid layout ---
// Physical 3x3 grid (centre omitted):
//
//   [0] [1] [2]
//   [3]  x  [4]
//   [5] [6] [7]
//
// We use the corner markers (0, 2, 5 ,7) for homography, other markers
// will be implemented later for occlusion protection
//
// Each marker's source point is the corner pointing toward the sheet centre:
//   marker 0 - corner index 2 (bottom-right)
//   marker 2 - corner index 3 (bottom-left)
//   marker 5 - corner index 1 (top-right)
//   marker 7 - corner index 0 (top-left)

const CORNER_MARKERS: Record<number, { innerCorner: number }> = {
  0: { innerCorner: 2 }, // top-left marker      -  bottom-right corner
  2: { innerCorner: 3 }, // top-right marker     -  bottom-left corner
  5: { innerCorner: 1 }, // bottom-left marker   -  top-right corner
  7: { innerCorner: 0 }, // bottom-right marker  -  top-left corner
};

// Output warp size in pixels
const WARP_W = 594;
const WARP_H = 924;

interface Point {
  x: number;
  y: number;
}

/**
 * Extract a single corner point from a marker's corner Mat
 * OpenCV stores corners as a 1-row Mat with 8 floats: [x0, y0, x1, y1, x2, y2, x3, y3]
 */
export function getCornerPoint(cornerMat: any, index: number): Point {
  return {
    x: cornerMat.floatAt(0, index * 2),
    y: cornerMat.floatAt(0, index * 2 + 1),
  };
}

/**
 * Given detected ids and corners, find all 4 homography markers and return their
 * inner corner points in order: [topLeft, topRight, bottomLeft, bottomRight]
 * Returns null if any of the 4 markers is missing
 */
export function findHomographyPoints(
  ids: any,
  corners: any,
): [Point, Point, Point, Point] | null {
  const found: Record<number, Point> = {};

  for (let i = 0; i < ids.rows; i++) {
    const id = ids.intPtr(i, 0)[0];
    if (id in CORNER_MARKERS) {
      const mat = corners.get(i);
      found[id] = getCornerPoint(mat, CORNER_MARKERS[id].innerCorner);
      mat.delete();
    }
  }

  if (!(0 in found && 2 in found && 5 in found && 7 in found)) return null;

  return [found[0], found[2], found[5], found[7]];
}

/**
 * Compute homography and warp the source image into warpCanvas
 * srcPoints: [topLeft, topRight, bottomLeft, bottomRight] in real space
 */
export function applyHomography(
  src: any,
  srcPoints: [Point, Point, Point, Point],
): void {
  const [tl, tr, bl, br] = srcPoints;

  // Source points (from camera)
  const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x,
    tl.y,
    tr.x,
    tr.y,
    bl.x,
    bl.y,
    br.x,
    br.y,
  ]);

  // Destination points (flat rectangle congruent to the inner shape of the markers)
  const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    WARP_W,
    0,
    0,
    WARP_H,
    WARP_W,
    WARP_H,
  ]);

  const H = cv.findHomography(srcMat, dstMat);

  const warped = new cv.Mat();
  const dsize = new cv.Size(WARP_W, WARP_H);
  cv.warpPerspective(src, warped, H, dsize);
  if (warpCanvas) {
    warpCanvas.width = WARP_W;
    warpCanvas.height = WARP_H;

  }
  cv.imshow(warpCanvas, warped);
  srcMat.delete();
  dstMat.delete();
  H.delete();
  warped.delete();
}

/**
 * 
 */
export function detectMarkers(): void {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const dictionary = cv.getPredefinedDictionary(8);  // 8 = DICT_6X6_50
  const parameters = new cv.aruco_DetectorParameters();
  const refine = new cv.aruco_RefineParameters(10, -1, true);
  const detector = new cv.aruco_ArucoDetector(dictionary, parameters, refine);

  const corners = new cv.MatVector();
  const ids = new cv.Mat();
  const rejected = new cv.MatVector();

  detector.detectMarkers(gray, corners, ids, rejected);

  if (ids.rows > 0) {
    // Convert between RGBA (HTML Canvas) and BGR (OpenCV)
    const bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
    cv.drawDetectedMarkers(bgr, corners, ids);
    cv.cvtColor(bgr, src, cv.COLOR_BGR2RGBA);
    bgr.delete();

    const homoPts = findHomographyPoints(ids, corners);

    if (homoPts) {
      // Draw circles on the 4 inner corners used for homography
      for (const pt of homoPts) {
        cv.circle(src, pt, 8, [0, 255, 255, 255], -1);
      }

      applyHomography(src, homoPts);
      stat.textContent = "Homography active";
    } else {
      const foundIds = Array.from(
        { length: ids.rows },
        (_, i) => ids.intPtr(i, 0)[0],
      );
      const needed = [0, 2, 5, 7].filter((id) => !foundIds.includes(id));
      stat.textContent = `Waiting for markers: ${needed.join(", ")}`;
    }
  } else {
    stat.textContent = "No markers detected";
  }

  cv.imshow(canvas, src);

  src.delete();
  gray.delete();
  corners.delete();
  ids.delete();
  rejected.delete();
  detector.delete();
  dictionary.delete();
  parameters.delete();

  requestAnimationFrame(detectMarkers);
}

export async function main(): Promise<void> {
  // Wait for OpenCV to load
  await new Promise<void>((resolve) => {
    if (cv.getBuildInformation) {
      resolve();
    } else {
      (cv as any).onRuntimeInitialized = resolve;
    }
  });

  stat.textContent = "Starting camera";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },  // use back camera if phone
    });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    stat.textContent = "Detecting";
    requestAnimationFrame(detectMarkers);
  } catch (e) {
    stat.textContent = `Error: ${(e as Error).message}`;
    console.error(e);
  }
}

main();

