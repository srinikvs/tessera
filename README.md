# Tessera v1.1.2

A calm 10×10 block puzzle. Drag polyominoes from the tray onto the board. Completely fill a row or column to clear it. No timer.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/tessera/`).

```bash
npx tsc -b
npm run build
npm run preview
```

Production assets are built with base `/tessera/` to match https://tessera-veera.duckdns.org/tessera/.

Serve the SPA so client paths do not 404:

```nginx
location /tessera/ {
    try_files $uri $uri/ /tessera/index.html;
}
```

## Play

1. Drag a block from the tray onto the board. Blocks cannot be rotated.
2. Completely filling a row or a column clears it.
3. Place all three tray pieces to get a new set. Leftover pieces stay after a line clear. Blocks that cannot fit anywhere turn gray. If every leftover block is gray, the game ends.

Score, best, and an in-progress run are saved in `localStorage`. Refreshing `/tessera/` resumes the board.

## Stack

- Vite + React 19 + TypeScript
- Canvas 2D game loop
- Procedural SFX (Web Audio)

## License

Use and modify freely for personal or commercial projects.
