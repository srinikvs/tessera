# Tessera v1.1

A calm 10×10 block puzzle. Drag polyominoes from the tray onto the board. Completely fill a row or column to clear it. No timer.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

```bash
npm run build
npm run preview
```

## Play

1. Drag a block from the tray onto the board. Blocks cannot be rotated.
2. Completely filling a row or a column clears it.
3. Place all three tray pieces to get a new set. Blocks that cannot fit anywhere turn gray. If every leftover block is gray, the game ends.

Score and best score are saved in `localStorage`.

## Stack

- Vite + React 19 + TypeScript
- Canvas 2D game loop
- Procedural SFX (Web Audio)

## License

Use and modify freely for personal or commercial projects.
