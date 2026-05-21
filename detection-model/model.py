import cv2
import numpy as np
import os
import asyncio
import websockets
import tensorflow as tf
from scipy.spatial.distance import cdist
import json
from dataclasses import dataclass, asdict
from typing import Optional
from collections import deque, Counter

@dataclass
class BoardState:
    tile_results: list       # [{row, col, cx, cy, resource, number}]
    port_results: list       # [{cx, cy, label, resource}]
    robber_tile_index: Optional[int]
    vertex_colors: list      # [{cx, cy, color, hex_index}]
    edge_colors: list        # [{cx, cy, angle, color, hex_index}]

# ── Config ────────────────────────────────────────────────────────────────────
LOWER_TEAL = np.array([ 92,  120, 80])
UPPER_TEAL = np.array([200, 255, 255])


PORT_COLOR_LOWER = np.array([196, 231, 243], dtype=np.uint8)
PORT_COLOR_UPPER = np.array([255, 255, 255], dtype=np.uint8)

PORT_NAMES_2to1 = ["brick", "ore", "sheep", "wheat", "wood"]
PORT_COLORS = {
    "wheat": (0,   200, 255),
    "wood":  (34,  139,  34),
    "brick": (0,     0, 200),
    "sheep": (144, 238, 144),
    "ore":   (128, 128, 128),
    "3to1":  (200, 200, 200),
}

RESOURCES_BGR = {
    "Hills": (np.array([20, 50, 113]), np.array([70, 95, 150])),
    "Forest": (np.array([30, 65, 30]), np.array([60, 95, 60])),
    "Pasture": (np.array([35, 145, 120]), np.array([75, 185, 165])),
    "Mountain": (np.array([60, 70, 85]), np.array([95, 110, 115])),
    "Desert": (np.array([75, 150, 170]), np.array([115, 180, 240])),
    "Field": (np.array([30, 105, 140]), np.array([75, 145, 205])),
}

RESOURCE_DRAW_COLORS = {
    "Pasture":  ( 80, 180,  80),
    "Field":    ( 30, 200, 220),
    "Hills":    ( 30,  60, 180),
    "Mountain": (120, 100,  80),
    "Forest":   ( 34,  85,  34),
    "Desert":   (100, 190, 220),
    "Water":    (160, 100,  40),
}

CATAN_SPIRAL_NUMBERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11]
CATAN_SPIRAL_POSITIONS = [
    (0,0),(0,1),(0,2),
    (1,3),(2,4),(3,3),
    (4,2),(4,1),(4,0),
    (3,0),(2,0),(1,0),
    (1,1),(1,2),
    (2,3),(3,2),(3,1),
    (2,1),(2,2),
]

KNOWN_RESOURCE_RANGES = {
    "wheat": {"B": (95,  115), "G": (140, 160), "R": (168, 188)},
    "wood":  {"B": (35,   55), "G": ( 51,  71), "R": ( 84, 104)},
    "brick": {"B": (61,   81), "G": ( 72,  92), "R": (146, 166)},
}

ROBBER_LOWER         = np.array([0,  0,  0])
ROBBER_UPPER         = np.array([35, 35, 35])
ROBBER_MAX_AREA_FRAC = 0.30
DESERT_BGR           = np.array([156, 208, 225], dtype=np.float32)
DESERT_THRESHOLD     = 40
FONT                 = cv2.FONT_HERSHEY_SIMPLEX
FRAME_BUFFER_SIZE    = 10    # frames kept for majority-vote stable state

# FIX 3: SAT_BOOST / VAL_BOOST moved to module level so _boost() can use them
SAT_BOOST, VAL_BOOST = 1.8, 1.5

PLAYER_DRAW_COLORS = {
    "orange": (0,   120, 220),
    "red":    (0,    30, 200),
    "blue":   (180,  80,  20),
    "white":  (240, 240, 240),
}
LABEL_TEXT = {"orange": "ORG", "red": "RED", "blue": "BLU", "white": "WHT"}

COLOR_TOLERANCE    = 15
EXCLUDE_SAND_BGR   = np.array([170, 215, 230], dtype=np.float32)
SAND_EXCLUSION_THR = 35

# ── Robber tracker config ─────────────────────────────────────────────────────
ROBBER_HISTORY_LEN   = 60
ROBBER_BASELINE_FRAC = 0.50
ROBBER_CURRENT_FRAC  = 0.25
ROBBER_DARKEN_THRESH = 18
ROBBER_MIN_HISTORY   = 20

# ── RobberTracker ─────────────────────────────────────────────────────────────
class RobberTracker:
    """Infers robber position from per-tile BGR darkening history."""

    def __init__(self):
        self._history: dict[int, deque] = {}
        self._robber_spiral: int | None = None

    def update(self, spiral_index: int, bgr: tuple):
        if spiral_index not in self._history:
            self._history[spiral_index] = deque(maxlen=ROBBER_HISTORY_LEN)
        self._history[spiral_index].append(bgr)

    @staticmethod
    def _bgr_to_v(bgr_vec: np.ndarray) -> float:
        px = np.clip(bgr_vec, 0, 255).astype(np.uint8)
        return float(cv2.cvtColor(px.reshape(1, 1, 3),
                                  cv2.COLOR_BGR2HSV)[0, 0, 2])

    def infer_robber(self, board_tiles: list) -> int | None:
        resource_of: dict[int, str] = {
            t["spiralIndex"]: t.get("resource", "")
            for t in board_tiles
            if t.get("spiralIndex") is not None
        }

        if self._robber_spiral is None:
            candidates = {si for si, res in resource_of.items()
                          if res == "Desert"}
            if not candidates:
                candidates = set(resource_of.keys())
        else:
            candidates = set(resource_of.keys())

        best_si, best_delta = None, 0.0
        for si in candidates:
            hist = self._history.get(si)
            if hist is None or len(hist) < ROBBER_MIN_HISTORY:
                continue
            arr = np.array(hist, dtype=np.float32)
            n   = len(arr)
            nb  = max(1, int(n * ROBBER_BASELINE_FRAC))
            nc  = max(1, int(n * ROBBER_CURRENT_FRAC))
            baseline_v = self._bgr_to_v(arr[:nb].mean(axis=0))
            current_v  = self._bgr_to_v(arr[n-nc:].mean(axis=0))
            delta_v    = baseline_v - current_v
            if delta_v > best_delta:
                best_delta = delta_v
                best_si    = si

        if best_si is not None and best_delta >= ROBBER_DARKEN_THRESH:
            self._robber_spiral = best_si

        return self._robber_spiral

    def reset(self):
        self._history.clear()
        self._robber_spiral = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def hex_to_bgr(h):
    h = h.lstrip('#')
    return (int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16))

def _range(h1, h2):
    a = np.array(hex_to_bgr(h1), dtype=np.float32)
    b = np.array(hex_to_bgr(h2), dtype=np.float32)
    return np.minimum(a, b), np.maximum(a, b)

COLOR_RANGES = [
    ("rect",     "orange", *_range("#ff8800", "#9b3e00")),
    ("triangle", "orange", *_range("#ff8000", "#a44301")),
    ("triangle", "red",    *_range("#570f00", "#ff3333")),
    ("rect",     "red",    *_range("#570f00", "#ff3333")),
    ("rect",     "blue",   *_range("#459dff", "#021522")),
    ("triangle", "blue",   *_range("#459dff", "#021522")),
    ("rect",     "white",  *_range("#ffffff", "#faffec")),
    ("triangle", "white",  *_range("#afb6ad", "#ffffff")),
]

# FIX 3: _boost() extracted to module level so both draw_vertices_edges
#         and the board-state builder inside process_frame can call it.
def _boost(bgr):
    c = np.array(bgr, dtype=np.float32)
    if np.linalg.norm(c - DESERT_BGR) < DESERT_THRESHOLD:
        return bgr
    px = np.array([[bgr]], dtype=np.uint8)
    h, s, v = cv2.cvtColor(px, cv2.COLOR_BGR2HSV).astype(np.float32)[0, 0]
    out = np.array([[[h, min(255., s * SAT_BOOST), min(255., v * VAL_BOOST)]]], dtype=np.uint8)
    return tuple(int(x) for x in cv2.cvtColor(out, cv2.COLOR_HSV2BGR)[0, 0])

# ── TensorFlow utilities ──────────────────────────────────────────────────────
def tf_classify_tile(avg_bgr_np):
    avg_tf = tf.constant(avg_bgr_np, dtype=tf.float32)
    for name, (lo, hi) in RESOURCES_BGR.items():
        if tf.reduce_all((avg_tf >= tf.constant(lo, dtype=tf.float32)) &
                         (avg_tf <= tf.constant(hi, dtype=tf.float32))):
            return name
    # No exact range match — fall back to nearest neighbour by midpoint distance
    avg_f = avg_bgr_np.astype(np.float32)
    best_name, best_dist = "Desert", float('inf')
    for name, (lo, hi) in RESOURCES_BGR.items():
        mid  = (lo.astype(np.float32) + hi.astype(np.float32)) / 2
        dist = float(np.linalg.norm(avg_f - mid))
        if dist < best_dist:
            best_dist = dist
            best_name = name
    return best_name

def tf_hist_correlation(crop_hsv, tmpl_hsv, crop_mask, tmpl_mask):
    h_bins, s_bins = 50, 60
    def make_hist(hsv_img, mask):
        m      = tf.cast(mask, tf.bool)
        h_vals = tf.boolean_mask(tf.cast(hsv_img[:,:,0], tf.float32), m)
        s_vals = tf.boolean_mask(tf.cast(hsv_img[:,:,1], tf.float32), m)
        h_idx  = tf.clip_by_value(tf.cast(h_vals / 180.0 * h_bins, tf.int32), 0, h_bins-1)
        s_idx  = tf.clip_by_value(tf.cast(s_vals / 256.0 * s_bins, tf.int32), 0, s_bins-1)
        flat   = h_idx * s_bins + s_idx
        hist   = tf.cast(tf.math.bincount(flat, minlength=h_bins*s_bins,
                                           maxlength=h_bins*s_bins), tf.float32)
        return hist / (tf.norm(hist) + 1e-8)
    corr = tf.reduce_sum(make_hist(crop_hsv, crop_mask) * make_hist(tmpl_hsv, tmpl_mask))
    return float(tf.maximum(corr, 0.0).numpy())

# ── Hexagon detection ─────────────────────────────────────────────────────────
def deduplicate_lines(lines, angle_thresh_deg=5, dist_thresh=15):
    if lines is None or len(lines) == 0: return []
    def params(l):
        x1,y1,x2,y2 = l[0]
        angle  = np.arctan2(y2-y1, x2-x1) % np.pi
        length = np.hypot(x2-x1, y2-y1)
        if length == 0: return angle, 0.0
        nx, ny = -(y2-y1)/length, (x2-x1)/length
        return angle, abs(x1*nx + y1*ny)
    at = np.deg2rad(angle_thresh_deg)
    P  = [params(l) for l in lines]
    used, merged = [False]*len(lines), []
    for i in range(len(lines)):
        if used[i]: continue
        grp = [i]
        for j in range(i+1, len(lines)):
            if used[j]: continue
            da = abs(P[i][0]-P[j][0]); da = min(da, np.pi-da)
            if da < at and abs(P[i][1]-P[j][1]) < dist_thresh:
                grp.append(j); used[j] = True
        used[i] = True
        best = max(grp, key=lambda k: np.hypot(lines[k][0][2]-lines[k][0][0],
                                                lines[k][0][3]-lines[k][0][1]))
        merged.append(lines[best])
    return merged

def line_to_params(line):
    x1,y1,x2,y2 = line[0]
    length = np.hypot(x2-x1, y2-y1)
    if length == 0: return None
    return (x1+x2)/2., (y1+y2)/2., (x2-x1)/length, (y2-y1)/length, length

def ray_ray_intersect(mx, my, ux, uy, ox, oy, ovx, ovy):
    d = ux*ovy - uy*ovx
    if abs(d) < 1e-6: return None
    t = ((ox-mx)*ovy - (oy-my)*ovx) / d
    return np.array([mx+t*ux, my+t*uy]), t

def detect_board_hexagon(img, hsv, h_img, w_img):
    mask  = cv2.morphologyEx(cv2.inRange(hsv, LOWER_TEAL, UPPER_TEAL),
                             cv2.MORPH_CLOSE,
                             cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)),
                             iterations=1)
    # Drop small connected components — floating teal/blue pieces on the table
    # near the board inject spurious lines that wreck the hull. Use a size
    # floor (not just "keep largest") because the board outline often breaks
    # into several big arcs that all need to be kept.
    n_cc, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n_cc > 1:
        keep = stats[:, cv2.CC_STAT_AREA] >= 500
        keep[0] = False  # background
        mask = np.isin(labels, np.where(keep)[0]).astype(np.uint8) * 255
    dedup = deduplicate_lines(cv2.HoughLinesP(cv2.Canny(mask, 80, 160, apertureSize=3),
                                              1, np.pi/180, 60,
                                              minLineLength=50, maxLineGap=15))
    margin, STEP, MAX_REACH = 20, 5, max(w_img, h_img)
    vertices = []
    for i, line in enumerate(dedup):
        p = line_to_params(line)
        if p is None: continue
        mx, my, ux, uy, seg_len = p
        reach = seg_len / 2.
        hits  = []
        while reach <= MAX_REACH:
            hits = []
            for j, other in enumerate(dedup):
                if i == j: continue
                op = line_to_params(other)
                if op is None: continue
                ox, oy, ovx, ovy, _ = op
                res = ray_ray_intersect(mx, my, ux, uy, ox, oy, ovx, ovy)
                if res is None: continue
                pt, t = res; px, py = pt
                if (abs(t) <= reach and
                        -margin <= px <= w_img+margin and
                        -margin <= py <= h_img+margin):
                    hits.append((t, pt))
            if len(hits) >= 2: break
            reach += STEP
        if len(hits) < 2: continue
        hits.sort(key=lambda h: h[0])
        for _, pt in hits: vertices.append(pt)

    def _greedy_furthest_six(pts):
        """Pick 6 hex corners from a candidate hull using greedy furthest-from-
        centroid with a 25° angular separation guard. Returns None if 6 corners
        can't be picked."""
        centroid = pts.mean(axis=0)
        deltas = pts - centroid
        angs = np.arctan2(deltas[:, 1], deltas[:, 0])
        dists = np.linalg.norm(deltas, axis=1)
        MIN_SEP = np.deg2rad(25)
        picked = []
        for idx in np.argsort(-dists):
            ang = angs[idx]
            ok = True
            for p in picked:
                da = abs(ang - angs[p])
                if min(da, 2 * np.pi - da) < MIN_SEP:
                    ok = False; break
            if ok:
                picked.append(idx)
                if len(picked) == 6: break
        return pts[picked] if len(picked) == 6 else None

    # Primary path: pick 6 corners from line-intersection candidates. Line
    # intersections triangulate to true corner positions much more accurately
    # than raw contour points.
    if len(vertices) >= 6:
        pts_arr  = np.array(vertices, dtype=np.float32)
        hull_idx = cv2.convexHull(pts_arr.reshape(-1,1,2), returnPoints=False)
        hull_pts = pts_arr[[idx[0] for idx in hull_idx]]
        picked = _greedy_furthest_six(hull_pts) if len(hull_pts) >= 6 else None
        if picked is not None and len(picked) == 6:
            return picked.reshape(6,1,2).astype(np.int32)

    # Fallback: when the outline is broken on one side, line intersections miss
    # that corner entirely. Use the mask's outer contour hull instead — every
    # visible corner is in there even if Hough never linked them.
    contour_cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contour_cnts: return None
    combined = np.vstack(contour_cnts)
    contour_hull = cv2.convexHull(combined).reshape(-1, 2).astype(np.float32)
    picked = _greedy_furthest_six(contour_hull) if len(contour_hull) >= 6 else None
    if picked is not None and len(picked) == 6:
        return picked.reshape(6,1,2).astype(np.int32)
    return None

# ── Tile helpers ──────────────────────────────────────────────────────────────
def hex_mask_fn(cx, cy, r, shape):
    mask = np.zeros(shape[:2], dtype=np.uint8)
    pts  = np.array([[int(cx + r*np.cos(np.radians(30+i*60))),
                      int(cy + r*np.sin(np.radians(30+i*60)))] for i in range(6)],
                    dtype=np.int32)
    cv2.fillPoly(mask, [pts], 255)
    return mask

def enhance_tile_contrast(img_bgr: np.ndarray) -> np.ndarray:
    # ── 1. CLAHE on each BGR channel independently ────────────────────────
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    b, g, r = cv2.split(img_bgr)
    img_eq = cv2.merge([clahe.apply(b), clahe.apply(g), clahe.apply(r)])

    # ── 2. Per-channel contrast stretch ──────────────────────────────────
    img_float = img_eq.astype(np.float32)
    b, g, r   = cv2.split(img_float)
    b = np.clip(b * 1.1, 0, 255)
    g = np.clip(g * 1.2, 0, 255)
    r = np.clip(r * 1.15, 0, 255)
    img_boosted = cv2.merge([b, g, r]).astype(np.uint8)

    # ── 3. Unsharp mask ───────────────────────────────────────────────────
    blur      = cv2.GaussianBlur(img_boosted, (0, 0), sigmaX=2.5)
    img_sharp = cv2.addWeighted(img_boosted, 1.4, blur, -0.4, 0)

    return img_sharp



def classify_all_tiles(final_hex_crop, H, W, R, cx0, cy0, tile_layout, locked_resources=None):
    num_rows    = len(tile_layout)
    col_spacing = R * np.sqrt(3)
    row_spacing = R * 1.5
    bgr_full    = final_hex_crop

    def get_pixels(tx, ty):
        hex_m = hex_mask_fn(tx, ty, R * 0.82, (H, W))
        return bgr_full[hex_m == 255], hex_m

    tile_results = []
    for row_idx, num_tiles in enumerate(tile_layout):
        row_y       = cy0 + (row_idx - (num_rows - 1) / 2) * row_spacing
        row_start_x = cx0 - ((num_tiles - 1) / 2) * col_spacing
        for t_idx in range(num_tiles):
            tx = int(row_start_x + t_idx * col_spacing)
            ty = int(row_y)
            if locked_resources is not None and (row_idx, t_idx) in locked_resources:
                res = locked_resources[(row_idx, t_idx)]
            else:
                pixels, _ = get_pixels(tx, ty)
                res = tf_classify_tile(np.mean(pixels, axis=0).astype(int)) if len(pixels) else "Desert"
            tile_results.append((row_idx, t_idx, tx, ty, res))
    return tile_results

# ── Player colour ─────────────────────────────────────────────────────────────
def classify_color(bgr_tuple, kind):
    c       = np.array(bgr_tuple, dtype=np.float32)
    is_sand = np.linalg.norm(c - EXCLUDE_SAND_BGR) < SAND_EXCLUSION_THR
    for ek, label, mn, mx in COLOR_RANGES:
        if ek != kind: continue
        if label == "white" and is_sand: continue
        if np.all(c >= mn-COLOR_TOLERANCE) and np.all(c <= mx+COLOR_TOLERANCE):
            return label, PLAYER_DRAW_COLORS[label]
    return None, None

def classify_sample(raw_bgr, kind):
    """Saturation-gated classification: only treat a sample as a player piece
    if the *raw* sample is genuinely saturated. _boost() amplifies muted tile
    tones into confident-looking orange/red, so always classifying the boosted
    color produces false positives on plain board pixels."""
    raw_hsv = cv2.cvtColor(np.array([[raw_bgr]], dtype=np.uint8),
                            cv2.COLOR_BGR2HSV)[0, 0]
    if raw_hsv[1] < 130:
        return None
    lbl, _ = classify_color(_boost(raw_bgr), kind)
    return lbl

def avg_bgr_region(img, mask):
    ys, xs = np.where(mask == 255)
    if len(xs) == 0: return (128, 128, 128)
    px     = img[ys, xs].astype(np.float32)
    cy_m, cx_m = ys.mean(), xs.mean()
    dists  = np.sqrt((xs-cx_m)**2 + (ys-cy_m)**2)
    sigma  = max(dists.max() * 0.4, 1.0)
    w      = (np.exp(-0.5*(dists/sigma)**2) *
              (px.max(axis=1)/255.)**3 *
              np.where(np.linalg.norm(px-DESERT_BGR, axis=1) < DESERT_THRESHOLD, 0.05, 1.0))
    tw = w.sum()
    if tw < 1e-6: return (128, 128, 128)
    return tuple(int(v) for v in ((px * w[:,None]).sum(axis=0) / tw))

def saturated_pixel_mean(img, mask, sat_min=150, min_frac=0.40):
    """Mean BGR of only the saturated pixels inside `mask`. Returns None when
    fewer than `min_frac` of the masked pixels are saturated above `sat_min`.
    Lets us tell "this sample contains a player piece" from "this sample is
    just tile background" — the latter has almost no saturated pixels even if
    a few stray bright pixels would otherwise drag a weighted mean toward a
    road-like color."""
    ys, xs = np.where(mask == 255)
    if len(xs) == 0: return None
    bgr_pixels = img[ys, xs]
    if bgr_pixels.size == 0: return None
    hsv_pixels = cv2.cvtColor(bgr_pixels.reshape(-1, 1, 3),
                               cv2.COLOR_BGR2HSV).reshape(-1, 3)
    sat = hsv_pixels[:, 1]
    keep = sat >= sat_min
    if keep.sum() < max(3, int(min_frac * len(bgr_pixels))):
        return None
    return tuple(int(v) for v in bgr_pixels[keep].mean(axis=0))

# ── Board drawing ─────────────────────────────────────────────────────────────
def draw_board(final_hex_crop, tile_results, R, H, W):
    board = final_hex_crop.copy()
    for _, _, tx, ty, res_name in tile_results:
        color = RESOURCE_DRAW_COLORS.get(res_name, (80,80,80))
        dm    = np.ones((H,W), dtype=np.uint8) * 255
        cv2.circle(dm, (int(tx), int(ty)), int(R*0.35), 0, -1)
        smask   = cv2.bitwise_and(hex_mask_fn(tx, ty, R*0.82, (H,W)), dm)
        overlay = board.copy()
        overlay[smask==255] = (np.array(overlay[smask==255], dtype=np.float32)*0.35 +
                               np.array(color, dtype=np.float32)*0.65).astype(np.uint8)
        cv2.addWeighted(overlay, 0.6, board, 0.4, 0, board)
        pts = np.array([[int(tx+R*np.cos(np.deg2rad(30+i*60))),
                         int(ty+R*np.sin(np.deg2rad(30+i*60)))] for i in range(6)], dtype=np.int32)
        cv2.polylines(board, [pts], True, color, 2)
        ts = cv2.getTextSize(res_name, FONT, 0.45, 1)[0]
        cv2.putText(board, res_name, (tx-ts[0]//2+1, ty+ts[1]//2+1), FONT, 0.45, (0,0,0), 2, cv2.LINE_AA)
        cv2.putText(board, res_name, (tx-ts[0]//2,   ty+ts[1]//2),   FONT, 0.45, (255,255,255), 1, cv2.LINE_AA)
    return board

# ── Vertex/Edge overlay ───────────────────────────────────────────────────────
def draw_vertices_edges(overlay, final_hex_crop, tile_results, R, H, W):
    VERTEX_HALF   = 22
    EDGE_LEN_HALF = 12
    EDGE_WIDTH    = 12
    SAMPLE_PAD    = 4
    SAT_BOOST, VAL_BOOST = 1.8, 1.5

    def boost(bgr):
        c = np.array(bgr, dtype=np.float32)
        if np.linalg.norm(c - DESERT_BGR) < DESERT_THRESHOLD: return bgr
        px = np.array([[bgr]], dtype=np.uint8)
        h, s, v = cv2.cvtColor(px, cv2.COLOR_BGR2HSV).astype(np.float32)[0,0]
        out = np.array([[[h, min(255., s*SAT_BOOST), min(255., v*VAL_BOOST)]]], dtype=np.uint8)
        return tuple(int(x) for x in cv2.cvtColor(out, cv2.COLOR_HSV2BGR)[0,0])

    def draw_triangle(canvas, cx, cy, color, size, flip):
        pts = (np.array([[int(cx), int(cy+size)],
                         [int(cx-size*.866), int(cy-size*.5)],
                         [int(cx+size*.866), int(cy-size*.5)]], dtype=np.int32) if flip else
               np.array([[int(cx), int(cy-size)],
                         [int(cx-size*.866), int(cy+size*.5)],
                         [int(cx+size*.866), int(cy+size*.5)]], dtype=np.int32))
        tm = np.zeros(canvas.shape[:2], dtype=np.uint8); cv2.fillPoly(tm, [pts], 255)
        canvas[tm==255] = (np.array(canvas[tm==255], dtype=np.float32)*0.25 +
                           np.array(color, dtype=np.float32)*0.75).astype(np.uint8)
        cv2.polylines(canvas, [pts], True, color, 2)

    def draw_rect(canvas, mx, my, ang, color):
        box = cv2.boxPoints(((float(mx),float(my)),
                             (float(EDGE_LEN_HALF*2), float(EDGE_WIDTH)),
                             float(ang))).astype(np.int32)
        fm = np.zeros(canvas.shape[:2], dtype=np.uint8); cv2.fillPoly(fm, [box], 255)
        canvas[fm==255] = (np.array(canvas[fm==255], dtype=np.float32)*0.25 +
                           np.array(color, dtype=np.float32)*0.75).astype(np.uint8)
        cv2.polylines(canvas, [box], True, color, 2)

    def draw_lbl(canvas, x, y, label):
        text  = LABEL_TEXT.get(label, "?")
        color = PLAYER_DRAW_COLORS.get(label, (200,200,200))
        (tw,th),_ = cv2.getTextSize(text, FONT, 0.4, 1)
        p = 3
        cv2.rectangle(canvas, (x-tw//2-p, y-th//2-p), (x+tw//2+p, y+th//2+p), (20,20,20), -1)
        cv2.rectangle(canvas, (x-tw//2-p, y-th//2-p), (x+tw//2+p, y+th//2+p), color, 1)
        cv2.putText(canvas, text, (x-tw//2, y+th//2), FONT, 0.4, color, 1, cv2.LINE_AA)

    for _, _, tx, ty, _ in tile_results:
        for i in range(6):
            a  = np.deg2rad(30 + i*60)
            vx, vy = int(tx+R*np.cos(a)), int(ty+R*np.sin(a))
            sm = np.zeros((H,W), dtype=np.uint8); cv2.circle(sm, (vx,vy), SAMPLE_PAD, 255, -1)
            raw = avg_bgr_region(final_hex_crop, sm)
            lbl, _ = classify_color(boost(raw), "triangle")
            draw_triangle(overlay, vx, vy, boost(raw), VERTEX_HALF, not(i%2==0))
            if lbl: draw_lbl(overlay, vx, vy-VERTEX_HALF-8, lbl)

        for i in range(6):
            a0 = np.deg2rad(30 + i*60);     a1 = np.deg2rad(30 + (i+1)*60)
            vx0,vy0 = tx+R*np.cos(a0), ty+R*np.sin(a0)
            vx1,vy1 = tx+R*np.cos(a1), ty+R*np.sin(a1)
            mx, my  = int((vx0+vx1)/2), int((vy0+vy1)/2)
            ea      = float(np.degrees(np.arctan2(vy1-vy0, vx1-vx0)))
            sm = np.zeros((H,W), dtype=np.uint8)
            cv2.fillPoly(sm, [cv2.boxPoints(((float(mx),float(my)),
                                             (float(EDGE_LEN_HALF*2), float(SAMPLE_PAD*2)),
                                             ea)).astype(np.int32)], 255)
            raw = avg_bgr_region(final_hex_crop, sm)
            lbl, _ = classify_color(boost(raw), "rect")
            draw_rect(overlay, mx, my, ea, boost(raw))
            if lbl:
                perp = np.deg2rad(ea + 90)
                draw_lbl(overlay, int(mx+14*np.cos(perp)), int(my+14*np.sin(perp)), lbl)
    return overlay


# ── Number placement ──────────────────────────────────────────────────────────
def place_numbers(overlay, tile_results, R):
    tile_map    = {(r,t): (tx,ty,res) for r,t,tx,ty,res in tile_results}
    number_iter = iter(CATAN_SPIRAL_NUMBERS)
    disc_results = []
    seen = set()
    for pos in CATAN_SPIRAL_POSITIONS:
        if pos in seen or pos not in tile_map: continue
        seen.add(pos)
        tx, ty, res = tile_map[pos]
        if res == "Desert":
            disc_results.append((tx, ty, res, None))
        else:
            try:
                disc_results.append((tx, ty, res, next(number_iter)))
            except StopIteration:
                break

    final_board = overlay.copy()
    for tx, ty, _, number in disc_results:
        if number is None: continue
        label = str(number)
        col   = (0,0,220) if number in [6,8] else (20,20,20)
        # cv2.circle(final_board, (tx,ty), int(R*0.28), (230,225,200), -1)
        # cv2.circle(final_board, (tx,ty), int(R*0.28), (120,110,80),   1)
        scale = 0.55 if number >= 10 else 0.65
        (tw,th),_ = cv2.getTextSize(label, FONT, scale, 2)
        org = (tx-tw//2, ty+th//2)
        # cv2.putText(final_board, label, org, FONT, scale, (0,0,0), 3, cv2.LINE_AA)
        # cv2.putText(final_board, label, org, FONT, scale, col,     1, cv2.LINE_AA)
    return final_board

# ── Port detection ────────────────────────────────────────────────────────────
def build_hex_exclusion_mask(shape, tile_results, R):
    mask = np.zeros(shape[:2], dtype=np.uint8)
    for _, _, tx, ty, _ in tile_results:
        pts = np.array([[int(tx+R*np.cos(np.radians(30+i*60))),
                         int(ty+R*np.sin(np.radians(30+i*60)))] for i in range(6)], dtype=np.int32)
        cv2.fillPoly(mask, [pts], 255)
    return mask

def get_normalisation_rotation(cx, cy, board_cx, board_cy):
    dx, dy = cx-board_cx, cy-board_cy
    fv     = np.degrees(np.arctan2(abs(dx), -dy)) % 360
    if fv <= 30:    mag = 180
    elif fv <= 60:  mag = 135
    elif fv <= 80:  mag = 90
    elif fv <= 105: mag = 45
    elif fv <= 150: mag = 15
    else:           mag = 0
    if dx > 0:   return int(mag % 360)
    elif dx < 0: return int((360-mag) % 360)
    else:        return int(mag)

def rotate_crop(img, angle):
    if angle == 0: return img
    h, w = img.shape[:2]
    return cv2.warpAffine(img, cv2.getRotationMatrix2D((w/2,h/2), -angle, 1.0), (w,h),
                          flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

def make_content_mask(img_bgr, dark_thresh=50, bright_thresh=220, sat_thresh=60):
    _, s, v = cv2.split(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV))
    excl = cv2.bitwise_or(cv2.inRange(img_bgr, PORT_COLOR_LOWER, PORT_COLOR_UPPER),
                          (v < dark_thresh).astype(np.uint8)*255)
    excl = cv2.bitwise_or(excl, (v > bright_thresh).astype(np.uint8)*255)
    excl = cv2.bitwise_or(excl, (s < sat_thresh).astype(np.uint8)*255)
    return cv2.morphologyEx(cv2.bitwise_not(excl), cv2.MORPH_OPEN, np.ones((3,3), np.uint8))

def make_portbg_only_mask(img_bgr):
    return cv2.morphologyEx(
        cv2.bitwise_not(cv2.inRange(img_bgr, PORT_COLOR_LOWER, PORT_COLOR_UPPER)),
        cv2.MORPH_OPEN, np.ones((3,3), np.uint8))

def remove_white_and_dark(img_bgr, dark_thresh=40, bright_thresh=230):
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    r    = img_bgr.copy()
    r[(gray < dark_thresh) | (gray > bright_thresh)] = (255,255,255)
    return r

def get_avg_content_color(img_bgr, mask):
    pixels = img_bgr[mask == 255]
    if pixels.size == 0: return None
    hsv_p  = cv2.cvtColor(pixels.reshape(-1,1,3), cv2.COLOR_BGR2HSV).reshape(-1,3)
    s_vals = hsv_p[:,1]
    vib    = pixels[s_vals >= np.percentile(s_vals, 50)]
    return tuple(map(int, np.mean(vib, axis=0).astype(int))) if vib.size > 0 else None

def predict_resource_from_avg(avg_bgr):
    b, g, r = avg_bgr
    for res, rng in KNOWN_RESOURCE_RANGES.items():
        if (rng["B"][0]<=b<=rng["B"][1] and
                rng["G"][0]<=g<=rng["G"][1] and
                rng["R"][0]<=r<=rng["R"][1]):
            return res
    return None

def load_port_templates(template_dir):
    templates = {}
    for name in PORT_NAMES_2to1:
        for ext in ["png","jpg","jpeg"]:
            path = os.path.join(template_dir, f"{name}.{ext}")
            if os.path.exists(path):
                img = cv2.imread(path)
                if img is not None:
                    templates[name] = img; break
    return templates

def match_port_template(crop, templates, threshold=0.35):
    if crop is None or crop.size == 0: return "3to1", 0.0, {}
    ch, cw     = crop.shape[:2]
    crop_clean = remove_white_and_dark(crop)
    crop_cm    = make_content_mask(crop)
    if cv2.countNonZero(crop_cm) < 30: return "3to1", 0.0, {}
    avg_bgr = get_avg_content_color(crop_clean, crop_cm)
    if avg_bgr:
        predicted = predict_resource_from_avg(avg_bgr)
        if predicted:
            return f"2:1 {predicted}", 1.0, {predicted: {"colour":1.0,"texture":1.0,"combined":1.0}}
    crop_hsv  = cv2.cvtColor(crop_clean, cv2.COLOR_BGR2HSV)
    crop_gray = cv2.cvtColor(crop_clean, cv2.COLOR_BGR2GRAY)
    scores = {}
    for name, tmpl in templates.items():
        tc  = remove_white_and_dark(cv2.resize(tmpl, (cw,ch), interpolation=cv2.INTER_AREA))
        tcm = make_content_mask(cv2.resize(tmpl, (cw,ch), interpolation=cv2.INTER_AREA))
        colour_score  = tf_hist_correlation(crop_hsv, cv2.cvtColor(tc,cv2.COLOR_BGR2HSV), crop_cm, tcm)
        tg  = cv2.bitwise_and(cv2.cvtColor(tc, cv2.COLOR_BGR2GRAY),
                               cv2.cvtColor(tc, cv2.COLOR_BGR2GRAY), mask=tcm)
        cg  = cv2.bitwise_and(crop_gray, crop_gray, mask=crop_cm)
        _, ts, _, _ = cv2.minMaxLoc(cv2.matchTemplate(cg, tg, cv2.TM_CCOEFF_NORMED))
        combined = (colour_score + max(0.0, float(ts))) / 2.
        scores[name] = {"colour": round(colour_score,3),
                        "texture": round(max(0.0,float(ts)),3),
                        "combined": round(combined,3)}
    if not scores: return "3to1", 0.0, {}
    best = max(scores, key=lambda n: scores[n]["combined"])
    return (f"2:1 {best}" if scores[best]["combined"] >= threshold else "3to1"), scores[best]["combined"], scores

def detect_port_blobs(board_img, tile_results, R):
    H, W = board_img.shape[:2]
    k    = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7,7))
    mask = cv2.morphologyEx(
               cv2.morphologyEx(cv2.inRange(board_img, PORT_COLOR_LOWER, PORT_COLOR_UPPER),
                                cv2.MORPH_CLOSE, k, iterations=2),
               cv2.MORPH_OPEN, k, iterations=1)
    hex_e  = cv2.erode(build_hex_exclusion_mask((H,W), tile_results, R),
                       cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)), iterations=2)
    cnts,_ = cv2.findContours(cv2.bitwise_and(mask, cv2.bitwise_not(hex_e)),
                               cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blobs  = []
    for cnt in cnts:
        if cv2.contourArea(cnt) < 300: continue
        x, y, w, h = cv2.boundingRect(cnt)
        cx, cy     = x+w//2, y+h//2
        bf  = np.zeros((H,W), dtype=np.uint8); cv2.drawContours(bf, [cnt], -1, 255, -1)
        roi = board_img[y:y+h, x:x+w].copy()
        roi[bf[y:y+h, x:x+w] == 0] = (255,255,255)
        blobs.append((cx, cy, roi))
    return blobs

# FIX 4: draw_ports now returns (port_board, port_results) so the caller
#         can access port_results when building the board state payload.
def draw_ports(port_board, blobs, R, H, W):
    PORT_TEMPLATES = load_port_templates(
        os.path.join(os.path.dirname(__file__), "port_templates")
    )
    board_cx, board_cy = W//2, H//2
    port_results = []
    for cx, cy, crop in blobs:
        rotation  = get_normalisation_rotation(cx, cy, board_cx, board_cy)
        norm_crop = rotate_crop(crop, rotation)
        port_label, best_score, _ = match_port_template(norm_crop, PORT_TEMPLATES)
        port_results.append((cx, cy, port_label, best_score, rotation))

    for idx, (cx, cy, port_label, best_score, rotation) in enumerate(port_results):
        if port_label.startswith("2:1"): continue
        crop      = next(c for bx,by,c in blobs if bx==cx and by==cy)
        norm_crop = rotate_crop(crop, rotation)
        pbm       = make_portbg_only_mask(norm_crop)
        img_up    = cv2.resize(norm_crop, (200,200), interpolation=cv2.INTER_LINEAR)
        mu        = cv2.resize(pbm,       (200,200), interpolation=cv2.INTER_NEAREST)
        gray      = cv2.cvtColor(img_up, cv2.COLOR_BGR2GRAY)
        sv        = gray[mu==255]
        ab        = float(np.mean(sv)) if sv.size > 0 else 255.
        tp        = int(cv2.countNonZero(mu))
        s         = 200
        cg        = gray[s*3//10:s*7//10, s*3//10:s*7//10]
        cm2       = mu[s*3//10:s*7//10, s*3//10:s*7//10]
        ct        = int(cv2.countNonZero(cm2))
        cr        = int(np.sum((cg<100) & (cm2==255))) / ct if ct > 0 else 0.
        near_2to1 = any(pl.startswith("2:1") and np.hypot(bx-cx,by-cy)<350
                        for bx,by,pl,_,_ in port_results if not(bx==cx and by==cy))
        if ab < 190 and cr > 0.015:    result = "ore"
        elif tp > 7000 and cr < 0.015: result = "sheep"
        else:                          result = "3to1"
        port_results[idx] = (cx, cy,
                             f"2:1 {result}" if result != "3to1" else "3to1",
                             best_score, rotation)

    for cx, cy, port_label, _, _ in port_results:
        res_key = port_label.split()[-1] if port_label.startswith("2:1") else "3to1"
        color   = PORT_COLORS.get(res_key, (200,200,200))
        cv2.circle(port_board, (cx,cy), 22, color,    -1)
        cv2.circle(port_board, (cx,cy), 22, (0,0,0),   2)
        label = port_label.upper().replace("2:1 ","")
        scale = 0.28 if len(label) > 4 else 0.36
        (tw,th),_ = cv2.getTextSize(label, FONT, scale, 1)
        cv2.putText(port_board, label, (cx-tw//2, cy+th//2), FONT, scale, (0,0,0),       2, cv2.LINE_AA)
        cv2.putText(port_board, label, (cx-tw//2, cy+th//2), FONT, scale, (255,255,255), 1, cv2.LINE_AA)

    # FIX 4: return both the drawn board and the port_results list
    return port_board, port_results

# ── Frame processor ───────────────────────────────────────────────────────────
def _encode(img: np.ndarray, quality: int = 82) -> bytes:
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes()

def _error_frame(img, msg: str) -> bytes:
    out = img.copy() if img is not None else np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(out, msg, (20, 50), FONT, 0.8, (0, 80, 255), 2, cv2.LINE_AA)
    return _encode(out)

def process_frame(jpg_bytes: bytes, locked_resources: dict | None = None,
                  robber_tracker: "RobberTracker | None" = None
                  ) -> tuple[bytes, str, dict]:
    arr = np.frombuffer(jpg_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return _error_frame(None, "Failed to decode frame"), "decode_error", {}

    l, a, b  = cv2.split(cv2.cvtColor(img, cv2.COLOR_BGR2LAB))
    orig_eq  = cv2.cvtColor(
        cv2.merge([cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8,8)).apply(l), a, b]),
        cv2.COLOR_LAB2BGR)
    h_ch, s_ch, v_ch = cv2.split(cv2.cvtColor(orig_eq, cv2.COLOR_BGR2HSV))
    hsv_proc = cv2.merge([h_ch, s_ch,
                          cv2.addWeighted(v_ch, 0.30,
                              cv2.normalize(v_ch, None, 0, 255, cv2.NORM_MINMAX), 0.60, 0)])
    h_img, w_img = img.shape[:2]

    hex_points = detect_board_hexagon(img, hsv_proc, h_img, w_img)
    if hex_points is None:
        out = img.copy()
        msg = "No board detected"
        (tw, th), _ = cv2.getTextSize(msg, FONT, 1.2, 2)
        cv2.rectangle(out, (16, 16), (36 + tw, 36 + th), (0, 0, 0), -1)
        cv2.putText(out, msg, (24, 24 + th), FONT, 1.2, (0, 80, 255), 2, cv2.LINE_AA)
        return _encode(out), "no_board", {}

    try:
        center      = np.mean(hex_points, axis=0)[0]
        def _cw_from_top(p):
            dx, dy = p[0][0] - center[0], p[0][1] - center[1]
            a = np.arctan2(dx, -dy)
            return a if a >= 0 else a + 2 * np.pi
        sorted_hex  = sorted(hex_points, key=_cw_from_top)
        src_pts     = np.array(sorted_hex).reshape(6, 2).astype(np.float32)
        size        = 440
        dst_pts     = np.array([[size + size*np.cos(np.radians(a)),
                                  size + size*np.sin(np.radians(a))]
                                 for a in [300, 0, 60, 120, 180, 240]],
                               dtype=np.float32)
        matrix, _   = cv2.findHomography(src_pts, dst_pts)
        canvas_size = size * 2
        rectified   = cv2.warpPerspective(orig_eq, matrix, (canvas_size, canvas_size))
        crop_mask   = np.zeros((canvas_size, canvas_size), dtype=np.uint8)
        cv2.fillPoly(crop_mask, [dst_pts.astype(np.int32)], 255)
        final_hex_crop = cv2.bitwise_and(rectified, rectified, mask=crop_mask)

        H, W         = final_hex_crop.shape[:2]
        tile_layout  = [3, 4, 5, 4, 3]
        PADDING      = 80
        R            = min((W - 2*PADDING) / ((max(tile_layout) + 0.5) * np.sqrt(3)),
                           (H - 2*PADDING) / (len(tile_layout) * 1.5 + 0.5))
        cx0, cy0     = W / 2, H / 2
        tile_results = classify_all_tiles(final_hex_crop, H, W, R, cx0, cy0, tile_layout, locked_resources)

        board   = draw_board(final_hex_crop, tile_results, R, H, W)
        overlay = draw_vertices_edges(board.copy(), final_hex_crop, tile_results, R, H, W)

        # ── Build board_tiles (needed before robber tracking) ─────────────
        spiral_lookup = {pos: i for i, pos in enumerate(CATAN_SPIRAL_POSITIONS)}
        board_tiles   = []
        number_iter2  = iter(CATAN_SPIRAL_NUMBERS)
        seen2         = set()
        tile_lookup   = {(r, t): (tx, ty, res) for r, t, tx, ty, res in tile_results}

        for pos in CATAN_SPIRAL_POSITIONS:
            if pos in seen2 or pos not in tile_lookup:
                seen2.add(pos)
                continue
            seen2.add(pos)
            r_idx, t_idx = pos
            tx, ty, res  = tile_lookup[pos]
            number = None if res == "Desert" else next(number_iter2, None)
            board_tiles.append({
                "spiralIndex": spiral_lookup.get(pos),
                "row":         r_idx,
                "col":         t_idx,
                "cx":          tx,
                "cy":          ty,
                "resource":    res,
                "number":      number,
            })

        # ── Feed tracker and infer robber ─────────────────────────────────
        if robber_tracker is not None:
            for tile in board_tiles:
                si  = tile.get("spiralIndex")
                if si is None:
                    continue
                tx_t, ty_t = tile["cx"], tile["cy"]
                sm = hex_mask_fn(tx_t, ty_t, R * 0.25, (H, W))
                ys, xs = np.where(sm == 255)
                if len(xs):
                    bgr_mean = tuple(int(v) for v in
                                     final_hex_crop[ys, xs].mean(axis=0))
                    robber_tracker.update(si, bgr_mean)
            robber_spiral = robber_tracker.infer_robber(board_tiles)
        else:
            robber_spiral = None

        robber_idx = robber_spiral
        if robber_spiral is not None:
            robber_tile = next(
                (t for t in board_tiles if t["spiralIndex"] == robber_spiral), None
            )
            if robber_tile:
                rtx, rty = robber_tile["cx"], robber_tile["cy"]
                cv2.circle(overlay, (rtx, rty), 15, (0, 0, 0),       -1)
                cv2.circle(overlay, (rtx, rty), 15, (255, 255, 255),   2)
                (tw, th), _ = cv2.getTextSize("ROBBER", FONT, 0.6, 2)
                cv2.rectangle(overlay,
                              (rtx-tw//2-5, rty-th//2-5),
                              (rtx+tw//2+5, rty+th//2+5), (0, 0, 0), -1)
                cv2.putText(overlay, "ROBBER", (rtx-tw//2, rty+th//2),
                            FONT, 0.6, (0, 255, 255), 2, cv2.LINE_AA)

        final_board2         = place_numbers(overlay, tile_results, R)
        blobs                = detect_port_blobs(final_hex_crop, tile_results, R)
        result, port_results = draw_ports(final_board2.copy(), blobs, R, H, W)

        # ── Vertex / edge colour samples ──────────────────────────────────
        DEDUP_TOL = 8
        vertex_list, edge_list = [], []
        vertex_seen, edge_seen = {}, {}

        def _find_vertex_nearby(vx_int, vy_int):
            base_kx = round(vx_int / DEDUP_TOL)
            base_ky = round(vy_int / DEDUP_TOL)
            for dkx in (0, -1, 1):
                for dky in (0, -1, 1):
                    k = (base_kx + dkx, base_ky + dky)
                    if k in vertex_seen:
                        return k, vertex_seen[k]
            return (base_kx, base_ky), None

        for _, _, tx, ty, _ in tile_results:
            hex_idx = next(
                (bt["spiralIndex"] for bt in board_tiles
                 if bt["cx"] == tx and bt["cy"] == ty),
                None
            )
            for i in range(6):
                a  = np.deg2rad(30 + i * 60)
                vx, vy = int(tx + R * np.cos(a)), int(ty + R * np.sin(a))
                sm = np.zeros((H, W), dtype=np.uint8)
                cv2.circle(sm, (vx, vy), 4, 255, -1)
                sat_mean = saturated_pixel_mean(final_hex_crop, sm)
                lbl = classify_sample(sat_mean, "triangle") if sat_mean else None
                _, existing_id = _find_vertex_nearby(vx, vy)
                if existing_id is not None:
                    existing = vertex_list[existing_id]
                    if hex_idx not in existing["hexIndex"]:
                        existing["hexIndex"].append(hex_idx)
                    if existing["color"] is None and lbl is not None:
                        existing["color"] = lbl
                else:
                    vertex_id = len(vertex_list)
                    key = (round(vx / DEDUP_TOL), round(vy / DEDUP_TOL))
                    vertex_seen[key] = vertex_id
                    vertex_list.append({"id": vertex_id, "cx": vx, "cy": vy,
                                         "hexIndex": [hex_idx], "color": lbl})

            for i in range(6):
                a0 = np.deg2rad(30 + i * 60);       a1 = np.deg2rad(30 + (i + 1) * 60)
                vx0, vy0 = tx + R * np.cos(a0), ty + R * np.sin(a0)
                vx1, vy1 = tx + R * np.cos(a1), ty + R * np.sin(a1)
                mx, my   = int((vx0 + vx1) / 2),   int((vy0 + vy1) / 2)
                ea       = float(np.degrees(np.arctan2(vy1 - vy0, vx1 - vx0)))
                _, vertex_a_id = _find_vertex_nearby(int(vx0), int(vy0))
                _, vertex_b_id = _find_vertex_nearby(int(vx1), int(vy1))
                if vertex_a_id is None: vertex_a_id = -1
                if vertex_b_id is None: vertex_b_id = -1
                key = (round(mx / DEDUP_TOL), round(my / DEDUP_TOL))
                sm       = np.zeros((H, W), dtype=np.uint8)
                cv2.fillPoly(sm, [cv2.boxPoints(
                    ((float(mx), float(my)), (24., 8.), ea)).astype(np.int32)], 255)
                sat_mean = saturated_pixel_mean(final_hex_crop, sm)
                lbl = classify_sample(sat_mean, "rect") if sat_mean else None
                if key in edge_seen:
                    existing = edge_list[edge_seen[key]]
                    if existing["color"] is None and lbl is not None:
                        existing["color"] = lbl
                else:
                    edge_seen[key] = len(edge_list)
                    edge_list.append({"cx": mx, "cy": my, "angle": round(ea, 1),
                                       "hexIndex": [hex_idx], "color": lbl,
                                       "vertexA": vertex_a_id,
                                       "vertexB": vertex_b_id})

        port_list = []
        for cx, cy, port_label, _, _ in port_results:
            res_key = port_label.split()[-1] if port_label.startswith("2:1") else "3:1"
            port_list.append({"cx": cx, "cy": cy, "label": port_label, "resource": res_key})

        state = BoardState(
            tile_results      = board_tiles,
            port_results      = port_list,
            robber_tile_index = robber_idx,
            vertex_colors     = vertex_list,
            edge_colors       = edge_list,
        )
        return _encode(result), "ok", asdict(state)

    except Exception as e:
        print(f"[CV] Pipeline error: {e}")
        return _error_frame(img, f"Error: {str(e)[:80]}"), "error", {}


def test_image(image_path: str, output_path: str = "test_output.jpg"):
    with open(image_path, "rb") as f:
        jpg_bytes = f.read()
    result_bytes, status, _ = process_frame(jpg_bytes)
    with open(output_path, "wb") as f:
        f.write(result_bytes)
    print(f"Status: {status}")
    print(f"Output saved to: {output_path}")

# ── Valid board state filter ──────────────────────────────────────────────────
VALID_RESOURCE_COUNTS = {"Forest": 4, "Pasture": 4, "Field": 4, "Hills": 3, "Mountain": 3, "Desert": 1}

def is_valid_board_state(state: dict) -> bool:
    tiles = state.get("tile_results", [])
    if len(tiles) != 19:
        return False
    counts = Counter(t.get("resource") for t in tiles)
    return all(counts.get(res, 0) == n for res, n in VALID_RESOURCE_COUNTS.items())

def compute_majority_state(buffer: list) -> dict:
    config_votes: Counter = Counter()
    config_state: dict = {}
    for state in buffer:
        tiles = sorted(state.get("tile_results", []), key=lambda t: t.get("spiralIndex", 0))
        key = tuple(t.get("resource") for t in tiles)
        config_votes[key] += 1
        config_state[key] = state

    best_key = config_votes.most_common(1)[0][0]
    best_tiles = config_state[best_key].get("tile_results", [])

    robber_votes: Counter = Counter(
        s.get("robber_tile_index")
        for s in buffer
        if s.get("robber_tile_index") is not None
    )
    majority_robber = robber_votes.most_common(1)[0][0] if robber_votes else None

    vertex_votes: dict = {}
    vertex_meta: dict = {}
    for state in buffer:
        for v in state.get("vertex_colors", []):
            key = (round(v["cx"] / 8) * 8, round(v["cy"] / 8) * 8)
            if key not in vertex_votes:
                vertex_votes[key] = Counter()
            vertex_votes[key][v.get("color")] += 1
            vertex_meta[key] = v
    majority_vertices = []
    for key, votes in vertex_votes.items():
        meta = dict(vertex_meta[key])
        meta["color"] = votes.most_common(1)[0][0]
        majority_vertices.append(meta)

    edge_votes: dict = {}
    edge_meta: dict = {}
    for state in buffer:
        for e in state.get("edge_colors", []):
            key = (round(e["cx"] / 8) * 8, round(e["cy"] / 8) * 8)
            if key not in edge_votes:
                edge_votes[key] = Counter()
            edge_votes[key][e.get("color")] += 1
            edge_meta[key] = e
    majority_edges = []
    for key, votes in edge_votes.items():
        meta = dict(edge_meta[key])
        meta["color"] = votes.most_common(1)[0][0]
        majority_edges.append(meta)

    port_votes: dict = {}
    port_meta: dict = {}
    for state in buffer:
        for p in state.get("port_results", []):
            key = (round(p["cx"] / 20) * 20, round(p["cy"] / 20) * 20)
            if key not in port_votes:
                port_votes[key] = Counter()
            port_votes[key][p.get("label", "3:1")] += 1
            port_meta[key] = p
    majority_ports = []
    for key, votes in port_votes.items():
        label = votes.most_common(1)[0][0]
        meta  = dict(port_meta[key])
        meta["label"]    = label
        meta["resource"] = label.split()[-1] if label.startswith("2:1") else "3:1"
        majority_ports.append(meta)

    return {
        "tile_results":      best_tiles,
        "port_results":      majority_ports,
        "robber_tile_index": majority_robber,
        "vertex_colors":     majority_vertices,
        "edge_colors":       majority_edges,
    }

# ── WebSocket server ──────────────────────────────────────────────────────────
async def cv_handler(websocket):
    valid_buffer: deque = deque(maxlen=FRAME_BUFFER_SIZE)
    locked_resources: dict | None = None  # set once board is stable; skips tile re-classification
    tiles_locked: bool = False
    majority: dict = {
        "buffer_size":       0,
        "valid_count":       0,
        "is_stable":         False,
        "tile_results":      [],
        "port_results":      [],
        "robber_tile_index": None,
        "vertex_colors":     [],
        "edge_colors":       [],
    }
    robber_tracker = RobberTracker()
    print(f"[CV] Client connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                processed, status, state = process_frame(message, locked_resources, robber_tracker)
                await websocket.send(processed)
                if status == "ok":
                    valid_buffer.append(state)
                    n = len(valid_buffer)
                    majority["buffer_size"] = n
                    majority["valid_count"] = n
                    majority["is_stable"]   = n == FRAME_BUFFER_SIZE
                    if majority["is_stable"] and not tiles_locked:
                        # Buffer just filled: elect the final board layout and lock it
                        majority.update(compute_majority_state(list(valid_buffer)))
                        locked_resources = {
                            (t["row"], t["col"]): t["resource"]
                            for t in majority["tile_results"]
                        }
                        tiles_locked = True
                    elif tiles_locked:
                        # Board locked — only refresh piece detections each frame
                        majority["vertex_colors"] = state.get("vertex_colors", [])
                        majority["edge_colors"]   = state.get("edge_colors", [])
                    payload = dict(state)
                    payload["majority"] = majority
                    await websocket.send(json.dumps(payload).encode())
                else:
                    await websocket.send(json.dumps({"error": status}).encode())
    except websockets.exceptions.ConnectionClosed:
        print(f"[CV] Client disconnected")

async def main():
    print("[CV] Server starting on ws://0.0.0.0:8765")
    async with websockets.serve(cv_handler, "0.0.0.0", 8765, max_size=10*1024*1024):
        await asyncio.Future()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        inp = sys.argv[1]
        out = sys.argv[2] if len(sys.argv) > 2 else "test_output.jpg"
        test_image(inp, out)
    else:
        asyncio.run(main())