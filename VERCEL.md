# Deploy arcFI to Vercel (make it public)

A public, working dApp that other people can use is the strongest possible
"real builder" signal. This gets arcFI online in a few minutes. The repo is
already configured (`vercel.json`), and the bridge packages are optional, so the
build succeeds even without them installed.

## Option A — GitHub import (easiest, recommended)

1. Push this repo to GitHub (if it isn't already):
   ```bash
   git add .
   git commit -m "arcFI: contract wiring, live feed, bridge, deploy config"
   git branch -M main
   git remote add origin https://github.com/<you>/arcfi.git   # skip if already set
   git push -u origin main
   ```
2. Go to https://vercel.com/new → **Import** your `arcfi` repo.
3. Vercel auto-detects Vite. Leave build command `npm run build`, output `dist`.
4. **Environment Variables** → add:
   - Key: `VITE_ARC_KEYS_CONTRACT_ADDRESS`
   - Value: `0xd7a41Abf1b4bF89E03Ef5D8EEdF39160b70318E1`
5. Click **Deploy**. You'll get a public `https://arcfi-....vercel.app` URL.

## Option B — Vercel CLI (no GitHub needed)

```bash
npm i -g vercel
vercel                       # first run: links/creates the project
# When asked, accept the Vite defaults (build: npm run build, output: dist)
vercel env add VITE_ARC_KEYS_CONTRACT_ADDRESS
#   paste: 0xd7a41Abf1b4bF89E03Ef5D8EEdF39160b70318E1   (choose Production)
vercel --prod                # deploy to production
```

## After deploying

- Open the public URL, connect a wallet on Arc Testnet, and do a real
  buy/sell/message so there's activity from the live app.
- Share the URL (e.g. in the Arc Discord builders channel). Real users
  interacting with your verified contract is exactly the footprint that matters.
- Re-deploy any time by pushing to `main` (Option A) or running `vercel --prod`.

## Notes

- The env var must start with `VITE_` to be exposed to the browser bundle.
- If you later fix the npm install and want the in-app bridge bundled, install
  the two `@circle-fin` packages and remove the `external`/`exclude` entries in
  `vite.config.ts` (comment there explains it).
