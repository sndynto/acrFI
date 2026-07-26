# Deploy ArcKeys v2 (hardened) & switch the app to it

`contracts/ArcKeys.sol` is now the **hardened v2** contract. It fixes the audit's
Critical/High/Medium items:

- **C-1 / H-1** — protocol & creator fees are **pull-payments**: they accrue to
  `pendingWithdrawals` and are claimed with `withdraw()`. A reverting or
  blocklisted recipient can no longer freeze anyone's trades or funds.
- **M-1** — `buyKeys(subject, amount, maxCost)` and `sellKeys(subject, amount, minProceeds)`
  enforce **slippage** bounds. The frontend passes a 2% tolerance automatically.
- **L-1** — **two-step** ownership (`transferOwnership` → `acceptOwnership`).
- **L-3** — profile string length limits.

> Heads-up: because `buyKeys`/`sellKeys` signatures changed, the app now targets
> the **v2 ABI**. Until you deploy v2 and point the app at the new address, the
> **Buy/Sell buttons will error** (profiles, feed, and creators still work, since
> those functions/events are unchanged). Deploy v2 to make trading work again.

## Steps

1. **Deploy** (constructor is unchanged, so the existing script works):
   ```bash
   source .env
   forge script script/DeployArcKeys.s.sol:DeployArcKeys \
     --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast
   ```
   Copy the printed `ArcKeys deployed at: 0x...` address.

2. **Point the app at the new address** — either set it in `.env`:
   ```ini
   VITE_ARC_KEYS_CONTRACT_ADDRESS=0xYOUR_NEW_V2_ADDRESS
   ```
   or replace the fallback address in `src/contracts/arcKeys.ts`.

3. **Update the deploy block** in `src/contracts/arcKeysClient.ts`:
   set `ARC_KEYS_DEPLOY_BLOCK` to the new contract's creation block (find it on
   `https://testnet.arcscan.app/address/<new-address>`). This keeps event queries
   fast/reliable.

4. **Restart** `npm run dev`.

5. **Verify** the new contract on ArcScan (same settings as `VERIFY.md`:
   Solidity 0.8.24, optimizer 200 runs, MIT, constructor arg = your fee wallet).

## What changes for users

- **Creators/protocol claim fees**: fees no longer arrive instantly. They build up
  on-chain; a **"Claim X USDC"** button appears in Profile when you have a balance
  (calls `withdraw()`).
- **Trades are slippage-protected**: a buy/sell reverts if the price moved more
  than 2% against you between quote and execution (adjustable in
  `arcKeysClient.ts`).
- Old v1 profiles/trades stay on the old address; the new contract starts fresh.
