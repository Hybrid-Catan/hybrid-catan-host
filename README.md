# hybrid-catan-host

###  Description
The **Hybrid Catan Server** is the authoritative backend that processes computer vision input, enforces game rules, and synchronizes real-time gameplay across all players.

It integrates a **Computer Vision (CV) pipeline** to interpret the physical board and convert it into structured game events, ensuring that all gameplay actions are automatically detected, validated, and reflected across connected clients in real time.

---

###  Features
* **Authoritative game state management**
* **Integrated Computer Vision** (OpenCV-based detection)
* **Rule engine** enforcing all Catan mechanics
* **Real-time multiplayer synchronization** (WebSockets)
* **Dice roll and turn management** system
* **Build validation** (roads, settlements, cities)
* **Robber detection** and interaction handling
* **Event-driven architecture**

---

### Tech Stack
* **Backend:** Node.js, Express
* **Real-time Communication:** Socket.IO
* **Computer Vision:** Python, OpenCV
* **Database (optional):** PostgreSQL, Prisma

---

### Project Structure
```text
src/
├── cv/        # Computer Vision processing (camera + detection)
├── game/      # Game logic and rule engine
├── events/    # Event definitions and handlers
├── socket/    # WebSocket communication
├── api/       # REST endpoints (lobby, setup)
├── models/    # Game state models
└── utils/     # Helper functions# hybrid-catan-server
```

---

### Getting Started
* Install dependencies
```npm install```
* Run the server
```npm run dev```

### Core Flow
* Camera captures the physical board.
* CV module detects changes (roads, settlements, robber).
* Events are sent to the game engine.
* Server validates actions using the rule engine.
* Game state is updated.
* Updates are broadcast to all connected clients.

### Key Principle
The server is the single source of truth. All actions (CV-detected or user-triggered) are strictly validated before updating the game state.

### Authors
* Pratul Wadhwa [@PratulW5](https://github.com/PratulW5)

### License
This project is developed for academic purposes as part of the **DECO3801** course at **The University of Queensland**.
