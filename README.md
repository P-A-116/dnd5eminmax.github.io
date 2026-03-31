# D&D 5e Min/Max Builder

A D&D 5e character optimization tool built with [SolidJS](https://www.solidjs.com/) and [Vite](https://vitejs.dev/), deployed to GitHub Pages via GitHub Actions.

## Live Site

[https://p-a-116.github.io/dnd5eminmax.github.io/](https://p-a-116.github.io/dnd5eminmax.github.io/)

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

The compiled output is placed in the `dist/` folder.

## Deployment

This project uses a GitHub Actions workflow (`.github/workflows/deploy.yml`) to build the app and deploy it to GitHub Pages on every push to `main`.

> **Important:** GitHub Pages must be configured to use **GitHub Actions** as the deployment source, not "Deploy from a branch". If Pages is set to "Deploy from a branch", it will serve the raw source files (including the uncompiled `index.html` that references `/src/index.tsx`), causing a blank white page with a MIME type error in the browser console.
>
> To configure this:
> 1. Go to **Settings → Pages** in this repository
> 2. Under **Build and deployment → Source**, select **GitHub Actions**
> 3. Save — the next workflow run (or a manual re-run) will deploy the compiled `dist/` output
