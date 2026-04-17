# AGENTS.md - Agentic Coding Guidelines for Miasma Massacre

A "Dead by Daylight"-inspired multiplayer game for Telegram Web Apps using Phaser 3, Three.js, Firebase, and Telegram Web App API.

## 1. Build/Lint/Test Commands

### Running the Game
No build system - runs directly in browser.

```bash
python -m http.server 8000
# Then open http://localhost:8000
```

### Testing
No automated tests. Manual testing:
1. Open game in browser
2. Killer mode: role-select → choose killer
3. Survivor mode: role-select → choose survivor
4. Multiplayer: create/join lobby with room code

### Linting
No linter configured. Follow conventions below.

---

## 2. Code Style Guidelines

### Language
- JavaScript (ES6+), no build step, no TypeScript
- Global functions (not modules/classes)
- Single HTML entry point loads scripts via `<script>` tags

### Naming Conventions
```
Files:       snake_case.js (game.js, player.js)
Functions:   camelCase (startGame, updatePlayer)
Constants:   UPPER_SNAKE_CASE (CONFIG, MAP_W, PLAYER_SPEED)
Globals:     camelCase (game, scene, player, isKiller)
UI IDs:      kebab-case (game-container, action-btn)
```

### Variable Declarations
```javascript
// Prefer const/let for new code
const CONFIG = { PLAYER_SPEED: 145 };
let gameTime = 0;

// Existing code uses var
var container = document.getElementById('game-container');
var g = this.make.graphics({ x: 0, y: 0, add: false });
```

### Functions & Code Organization
```javascript
// ═══════ SECTION NAME ═══════
function startGame(killerMode, multiplayer, code, pid) {
    isKiller = killerMode;
    isMultiplayer = multiplayer || false;
}
```

### Script Loading Order
```html
<script src="src/game/config.js"></script>
<script src="src/game/state.js"></script>
<script src="src/game/utils.js"></script>
<script src="src/game/three3d.js"></script>
<script src="src/game/atmosphere.js"></script>
<script src="src/game/input.js"></script>
<script src="src/game/game.js"></script>
```

### Error Handling
```javascript
// try/catch for graceful degradation
try { initThreeJS(); } catch (e) { }

// Check conditions first
var container = document.getElementById('game-container');
if (!container) { return; }
```

### Phaser Patterns
```javascript
function preload() {
    this.load.image('ground_tile', 'src/textures/ground/ground_tile.webp');
}

function create() {
    player = this.physics.add.sprite(400, 300, 'survivor');
}

function update(time, delta) {
    // Game loop (~60fps)
}
```

### Texture Generation
```javascript
var g = this.make.graphics({ x: 0, y: 0, add: false });
g.fillStyle(0x3a2a1a);
g.fillRect(0, 0, 128, 128);
g.generateTexture('tree0', 70, 100);
g.clear();
```

### UI/Text (Russian)
```javascript
UI.showToast('\uD83D\uDD2A \u041F\u043E\u0439\u043C\u0430\u0439 \u0432\u0441\u0435\u0445!');
UI.updateHUD(p.role, p.state, genCount, exitOpen, hatchOpen, survivorsAlive);
```

---

## 3. Architecture Overview

### Game State (state.js)
Global variables: `isKiller`, `isMultiplayer`, `roomCode`, `player`, `playerId`, `game`, `scene`, `generators`, `hooks`, `gates`, `pallets`, `matchStats`

### Scene Functions
- `preload()`: Load textures
- `create()`: Initialize game world
- `update(time, delta)`: Game loop (~60fps)

### 3D Rendering
Three.js loaded only on non-low-end devices:
```javascript
if (!window.isLowEndDevice && typeof THREE !== 'undefined') {
    initThreeJS();
}
```

---

## 4. Adding New Features

### New Texture
1. Create in `preload()` in game.js
2. Use Graphics API for procedural textures

### New Game Object
1. Add to appropriate array in state.js
2. Initialize in `create()`
3. Handle in `update()`

### New Character
1. Add to CHARACTER_CONFIG in state.js
2. Add model files to src/models/
3. Reference in character selection UI

---

## 5. Testing Checklist

- [ ] Game loads without console errors
- [ ] Killer mode works (catch survivors)
- [ ] Survivor mode works (repair generators)
- [ ] Map renders correctly
- [ ] Touch controls work on mobile
- [ ] Keyboard controls work on desktop

---

## 6. Performance

- Check `window.isLowEndDevice` before heavy assets
- Use object pooling for particles/effects
- Use generated textures instead of loading images
- Target 30fps low-end, 60fps standard

---

## 7. Conventions Summary

| Aspect | Convention |
|--------|------------|
| Files | snake_case.js |
| Functions | camelCase |
| Variables | var (existing), const/let (new) |
| Indentation | 4 spaces |
| Comments | `// ═══════ === ═══════` |
| Equality | Use `===` not `==` |
| Strings | Single quotes preferred |

---

## 8. Technical Debt

- Uses `var` throughout
- Some global state could be encapsulated
- No automated tests
- Some try/catch silently swallows errors

When making changes, prefer modern JavaScript (const/let, arrow functions) but maintain compatibility with existing style.