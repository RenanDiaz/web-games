# Web Games Collection

A collection of browser-based games built with SvelteKit.

## Games

### Among Us Party
A real-life party game inspired by Among Us. Use this app to secretly assign roles to players and track scores.

**How to play:**
1. **Setup**: Enter a 4-digit PIN, choose the number of impostors, and add all players
2. **Role Check**: Each player selects their name and enters the PIN to see their role privately
3. **Play**: Play the real-life game however you like (hide and seek, tasks, discussions, voting)
4. **End Round**: Record who won (Crewmates or Impostors) and start a new round

**Features:**
- Secret role assignment with PIN protection
- Support for 1-3 impostors
- Score tracking across multiple rounds
- Player statistics (times as impostor/crewmate, win rates)
- Game state saved in browser (survives page refresh)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

This project uses SvelteKit with the static adapter, making it easy to deploy to any static hosting:

- **Vercel**: Connect your repo and it will auto-detect SvelteKit
- **Netlify**: Same as Vercel, auto-detection works
- **GitHub Pages**: Run `npm run build` and deploy the `build` folder

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Full-stack framework
- [Svelte 5](https://svelte.dev/) - UI framework with runes
- TypeScript - Type safety
- Static adapter - Pre-rendered for fast loading
