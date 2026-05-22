# Hybrid Catan

A hybrid board game system that augments a physical Settlers of Catan game with real-time computer vision, a live 3D digital overlay, and a mobile-first rule engine — all networked over WebRTC and WebSocket.

---

## Overview

A host mounts a camera above the physical board. A Python CV server analyses each frame, detects tile types, ports, the robber, and player pieces, and streams annotated frames + structured board state to a Next.js host app. Players join on their phones and interact with a live digital game state (resources, trading, dev cards, victory points) that is continuously reconciled against the physical board via CV.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Physical World                                                                  │
│  ┌────────────┐    JPEG frames (WebSocket)    ┌────────────────────────────────┐ │
│  │  Overhead  │ ────────────────────────────► │  Python CV Server  :8765       │ │
│  │  Camera    │                               │  modely.py                     │ │
│  └────────────┘                               │  • Board hexagon detection     │ │
│                                               │  • Tile classification (BGR)   │ │
│                                               │  • Port detection              │ │
│                                               │  • Robber detection            │ │
│                                               │  • Vertex/edge color sampling  │ │
│                                               │  • 100-frame majority vote     │ │
│                                               └─────────────┬──────────────────┘ │
└─────────────────────────────────────────────────────────────│────────────────────┘
                                                              │ annotated JPEG + JSON
                                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Next.js Host App  (port 3000)                                                   │
│                                                                                  │
│  ┌─────────────┐    WebSocket     ┌─────────────────────────────────────────┐   │
│  │  Host Page  │◄────────────────►│  CV WebSocket handler (browser-side)    │   │
│  │  /host      │                  │  Toggles JPEG / JSON each message pair  │   │
│  │             │  POST /api/game  │  Calls /api/game/update-cv on each frame│   │
│  │  • Camera   │  /update-cv      └─────────────────────────────────────────┘   │
│  │  • 3D board │                                                                 │
│  │  • CV feed  │  ┌──────────────────────────────────────────────────────────┐  │
│  │  • Logs     │  │  In-memory Game Store   (games: Map<gameId, GameState>)  │  │
│  └─────────────┘  │  Single source of truth — all API routes read/write here │  │
│                   └──────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │  REST API Routes                                                           │  │
│  │                                                                            │  │
│  │  /api/init/gamestate     POST  Create or retrieve game                     │  │
│  │  /api/init/player        POST  Register player (name, color, sequence)     │  │
│  │  /api/init/start         POST  Transition to SETUP_1                       │  │
│  │  /api/init/get           POST  Fetch current game state                    │  │
│  │                                                                            │  │
│  │  /api/game/roll          POST  Roll dice → resource distribution or 7      │  │
│  │  /api/game/discard       POST  Player discards on 7                        │  │
│  │  /api/game/update-cv     POST  Ingest CV board state each frame            │  │
│  │                                                                            │  │
│  │  /api/game/build/road        POST  Deduct resources, build road            │  │
│  │  /api/game/build/settlement  POST  Deduct resources, build settlement      │  │
│  │  /api/game/build/city        POST  Deduct resources, upgrade to city       │  │
│  │                                                                            │  │
│  │  /api/game/devCard/knight        POST  Play Knight card                    │  │
│  │  /api/game/devCard/invention     POST  Year of Plenty                      │  │
│  │  /api/game/devCard/monopoly      POST  Monopoly                            │  │
│  │  /api/game/devCard/roadBuilding  POST  Road Building                       │  │
│  │                                                                            │  │
│  │  /api/game/robber/place   POST  Validate & commit robber move              │  │
│  │  /api/game/robber/steal   POST  Resolve steal target choice                │  │
│  │                                                                            │  │
│  │  /api/game/trading/new          POST  Propose trade                        │  │
│  │  /api/game/trading/accept       POST  Fulfil trade                         │  │
│  │  /api/game/trading/reject       POST  Cancel trade                         │  │
│  │  /api/game/trading/bank         POST  4:1 (or port) bank trade             │  │
│  │                                                                            │  │
│  │  /api/game/turn/roll     POST  Set phase → ROLL                            │  │
│  │  /api/game/turn/build    POST  Set phase → BUILD                           │  │
│  │  /api/game/turn/end      POST  Advance to next player                      │  │
│  │  /api/game/turn/setup    POST  Confirm setup road + advance                │  │
│  │                                                                            │  │
│  │  /api/network-info       GET   LAN IP for QR code / join links             │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  WebRTC (via Socket.IO signalling on :3000/ws)                                  │
│  Host → Players: canvas.captureStream(15fps) of CV-annotated feed               │
└─────────────────────────────────┬────────────────────────────────────────────────┘
                                  │  WebRTC video stream (P2P)
                                  │  Polling  /api/init/get  (players)
                                  ▼
┌─────────────────────────────────────────────────────────┐
│  Player App  (port 3001)                                │
│  Mobile browser, one per player                         │
│  • Join lobby (/join/:gameId)                           │
│  • Watch CV-annotated video stream                      │
│  • Roll dice, build, trade, play dev cards              │
│  • View own hand + scoreboard                           │
└─────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
/
├── modely.py                         # Python CV WebSocket server
│
├── app/
│   ├── host/page.tsx                 # Host console UI (camera, CV feed, 3D board)
│   ├── components/
│   │   └── CatanBoard3D.tsx          # Three.js 3D board renderer
│   └── lib/
│       └── games.ts                  # In-memory game store (Map<gameId, GameState>)
│
├── backend/
│   └── gamelogic/
│       ├── initilaisaiton/init.ts    # initGameState(), initPlayer()
│       ├── playerstatmanagement/     # buildRoad/Settlement/City, dev cards
│       ├── turnmanagement/           # setPhaseToRoll/Build, setNextPlayer
│       ├── gamerules/
│       │   ├── gamerules.ts          # canPlaceRobber, canConfirmSetup, validateBoard
│       │   └── tradevalidation.ts    # checkSenderTradeRequest, checkReceiverTradeRequest
│       ├── robber/
│       │   ├── robber.ts             # placeRobber, resolveStealChoice, applyDetectedRobberMove
│       │   └── discard.ts            # computePendingDiscards, canDiscard, applyDiscard
│       └── trading/trading.ts        # addTradeToGameState, fulfillTrade, bankTrade, cancelTrade
│
├── utils/
│   └── boardState.ts                 # parseBoardState(), CV_TO_GAME_COLOR mapping
│
└── app/api/                          # All Next.js API route handlers (see API Reference)
```

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- A webcam or IP camera accessible from the host machine

### 1. Install Python dependencies

```bash
pip install opencv-python numpy websockets tensorflow scipy
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Configure environment variables

Create `.env.local` in the project root:

```env
# WebSocket URL the host browser connects to for signalling
NEXT_PUBLIC_HOST_WS=ws://localhost:3000/ws

# WebSocket URL the host browser sends frames to (Python CV server)
NEXT_PUBLIC_CV_WS=ws://localhost:8765
```

For LAN play replace `localhost` with your machine's LAN IP (the app auto-detects this via `/api/network-info` for the QR code, but the env vars must match).

### 4. Start the Python CV server

```bash
python modely.py
```

The server listens on `ws://0.0.0.0:8765`. It accepts raw JPEG frames and responds with two messages per frame: an annotated JPEG, then a JSON board state payload.

### 5. Start the Next.js apps

```bash
# Host app (port 3000)
npm run dev

# Player app (port 3001) — if using a separate Next.js app
npm run dev:player
```

### 6. Open the host console

Navigate to `http://localhost:3000/host`, press **Connect Camera**, then share the 5-character room code or QR code with players. Press **Start Game** when everyone has joined.

---

## CV Pipeline

`modely.py` runs entirely inside the Python WebSocket server. Each frame goes through:

1. **CLAHE equalisation** on the L channel (LAB colour space) to normalise exposure.
2. **Board hexagon detection** — finds the teal outer border via HSV threshold + Hough lines + convex hull, then warps the board to a normalised 880×880 canvas.
3. **Tile classification** — samples average BGR inside each hex mask and matches against known colour ranges for Hill, Forest, Pasture, Mountain, Desert, Field.
4. **Port detection** — finds light-coloured blobs outside the hex area, classifies each by dominant colour (brick / wood / wheat priority), then assigns port labels clockwise from the first recognised 2:1 anchor.
5. **Robber detection** — dark blob search within tile interior masks (0.5×R radius); snaps to nearest tile centre if within 30% of R.
6. **Vertex/edge colour sampling** — saturation-gated classification at each of the 6×N hex vertices and edges, with deduplication across shared corners.
7. **100-frame majority vote** — a rolling `deque` of valid frames; the most common tile layout wins, and vertex/edge colours are individually majority-voted.

The server sends two WebSocket messages per processed frame:
- `bytes` — annotated JPEG
- `bytes` (UTF-8 JSON) — `BoardState` dict including `tile_results`, `port_results`, `robber_tile_index`, `vertex_colors`, `edge_colors`, and a `majority` sub-object with stability metadata.

---

## Game State Machine

```
                  ┌──────────┐
                  │  LOBBY   │  (players joining)
                  └────┬─────┘
                       │  /api/init/start
                  ┌────▼─────┐
          ┌──────►│  SETUP_1 │  (each player places settlement + road, forward order)
          │        └────┬─────┘
          │             │  all placed
          │        ┌────▼─────┐
          │        │  SETUP_2 │  (reverse order, second settlement + road)
          │        └────┬─────┘
          │             │
          │        ┌────▼─────┐
          │   ┌───►│   ROLL   │◄────────────────────────────────────────────┐
          │   │    └────┬─────┘                                             │
          │   │         │  /api/game/roll                                   │
          │   │    ┌────▼──────┐   roll = 7   ┌──────────┐                 │
          │   │    │  BUFFER   │─────────────►│  DISCARD │  (if any player │
          │   │    │ (resource │              │          │   has >7 cards)  │
          │   │    │  grant)   │              └────┬─────┘                 │
          │   │    └────┬──────┘                   │  all discarded        │
          │   │         │ non-7                ┌───▼──────┐                │
          │   │    ┌────▼──────┐               │  ROBBER  │  (move pawn)   │
          │   │    │   BUILD   │◄──────────────└──────────┘                │
          │   │    │ (trading, │                                            │
          │   │    │  build,   │                                            │
          │   │    │  devcard) │                                            │
          │   │    └────┬──────┘                                            │
          │   │         │  /api/game/turn/end                               │
          │   └─────────┘  (next player, back to ROLL) ────────────────────┘
          │
          └── setup phases handled by /api/game/turn/setup
```

---

## API Reference

All endpoints accept and return JSON. The `gameState` body field is the full client-side game state; routes always fetch the authoritative copy from the in-memory store (`games.get(gameState.gameId)`) before acting on it.

### Initialisation

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/init/gamestate` | `{ gameId }` | Create game or return existing |
| POST | `/api/init/player` | `{ gameId, name, color, sequence }` | Register player |
| POST | `/api/init/start` | `{ gameId }` | Transition to `SETUP_1` |
| POST | `/api/init/get` | `{ gameId }` | Fetch current state |
| GET  | `/api/network-info` | — | Returns `{ lanIp }` |

### Gameplay

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/game/roll` | `{ gameState }` | Roll dice, distribute resources, or trigger 7 flow |
| POST | `/api/game/discard` | `{ gameState, playerId, discard }` | Discard half on 7 |
| POST | `/api/game/update-cv` | `{ gameId, cvBoardState }` | Ingest CV state, seed/move robber, validate placements |

### Building

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/game/build/road` | `{ gameState }` | Build road (1W + 1B) |
| POST | `/api/game/build/settlement` | `{ gameState }` | Build settlement (1W + 1B + 1Wh + 1Wo) |
| POST | `/api/game/build/city` | `{ gameState }` | Upgrade settlement to city (2Wh + 3O) |

### Development Cards

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/game/devCard/knight` | `{ gameState }` | Play Knight |
| POST | `/api/game/devCard/invention` | `{ gameState, resource1, resource2 }` | Year of Plenty |
| POST | `/api/game/devCard/monopoly` | `{ gameState, resource }` | Monopoly |
| POST | `/api/game/devCard/roadBuilding` | `{ gameState }` | Road Building |

### Robber

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/game/robber/place` | `{ gameState, robberPosition, targetPlayerId? }` | Validate & place robber |
| POST | `/api/game/robber/steal` | `{ gameState, targetPlayerId }` | Resolve steal choice |

### Trading

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/game/trading/new` | `{ gameState, sender, receiver, sendingCards, receivingCards }` | Propose trade |
| POST | `/api/game/trading/accept` | `{ gameState, tradeIndex }` | Accept and fulfil trade |
| POST | `/api/game/trading/reject` | `{ gameState, tradeIndex }` | Reject/cancel trade |
| POST | `/api/game/trading/bank` | `{ gameState, senderId, give, get }` | Bank trade (4:1 or port rate) |

### Turn Management

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/game/turn/roll` | `{ gameState }` | Set phase → ROLL |
| POST | `/api/game/turn/build` | `{ gameState }` | Set phase → BUILD |
| POST | `/api/game/turn/end` | `{ gameState }` | Advance to next player |
| POST | `/api/game/turn/setup` | `{ gameState }` | Confirm setup placement, advance |

---

## Key Design Decisions

**Two-message WebSocket protocol.** The Python server sends JPEG then JSON alternately. The browser toggles a `cvExpectJsonRef` flag between messages rather than parsing a binary envelope, keeping both sides simple. A 3-second watchdog resets the flag if the server goes quiet.

**Host-authoritative game store.** All API routes call `games.get(gameState.gameId)` instead of trusting the posted `gameState`. Phone clients poll every few seconds, so their local copy can be stale; the in-memory map is always fresh.

**CV-driven robber.** When the game is in `ROBBER` phase, `update-cv` watches for the pawn index changing and calls `applyDetectedRobberMove`, which handles 0/1/2+ steal candidates and sets the next phase automatically.

**Majority vote stability.** The CV pipeline accumulates 100 valid frames before declaring the board stable. Tile layout is elected by most-common configuration key; vertex/edge colours are majority-voted independently per position. Once stable, the 3D Three.js board is populated and tile layout is locked — it never re-renders from a later frame even if CV glitches.

**Saturation gate on piece detection.** `classify_sample()` rejects any colour sample whose raw HSV saturation is below 130 before applying the brightness boost. This prevents tile texture noise from being amplified into false road/settlement detections.

---

## Python Dependencies

```
opencv-python
numpy
websockets
tensorflow
scipy
```

Install with:
```bash
pip install opencv-python numpy websockets tensorflow scipy
```

---

## Testing the CV Server

You can run the CV pipeline on a single image without starting the WebSocket server:

```bash
python modely.py path/to/board_photo.jpg output.jpg
```

This writes the annotated image to `output.jpg` and prints a diagnostic table of port blob colours and detections to stdout.