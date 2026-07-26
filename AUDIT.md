# arcFI — Security Audit

Scope: `contracts/ArcKeys.sol`, the React frontend (`src/App.tsx`,
`src/contracts/*`, `src/appkit/bridge.ts`, `src/BridgePanel.tsx`), and project
config (`.gitignore`, `.env`, Foundry, Vercel). Target: Arc Testnet.

**Overall:** The contract's reserve accounting is solvent and reentrancy is
handled correctly. The serious issues are (1) fee payouts that let a single
address permanently freeze funds, (2) no slippage protection, and (3) a config
gap that risked leaking your private key. Item (3) is already fixed in this pass.

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low · ⚪ Info

---

## Already fixed in this audit

**🔴 C-0 — `.env` was not git-ignored (private-key leak risk). FIXED.**
`.gitignore` did not exclude `.env`. Since deploying with Foundry puts your
`PRIVATE_KEY` in `.env`, and the Vercel guide has you `git push`, your key could
have been published to a public repo. `.gitignore` now excludes `.env` / `.env.*`
(keeping `.env.example`) plus Foundry's `out-forge`/`cache`/`broadcast`.
- **Action for you:** if you ever committed a `.env`, treat that key as
  compromised — generate a new wallet (`cast wallet new`) and never reuse the old
  key. Prefer a keystore (`cast wallet import`) over a raw key in `.env`.

---

## Smart contract — `ArcKeys.sol`

### 🔴 C-1 — A reverting/blocklisted creator (`subject`) permanently locks holders' funds in `sellKeys`
`buyKeys`/`sellKeys` pay the creator fee by pushing native value to `subject`
and revert the whole trade on failure. If `subject` can't receive native USDC —
by being a contract with a reverting `receive`, a later-upgraded proxy, a
precompile, or (Arc-specific) a **blocklisted** address — then **no one can sell
that creator's keys**. Every holder's funds sit in the reserve with no recovery
path (there's no owner sweep). A malicious creator can weaponize this; it can
also happen with no attacker via USDC blocklisting.

**Fix:** pull-payments — credit fees to a balance and let recipients `withdraw`,
so a bad recipient can never block a trade:
```solidity
mapping(address => uint256) public pendingWithdrawals;
function _credit(address to, uint256 amt) private { if (amt>0) pendingWithdrawals[to]+=amt; }
function withdraw() external nonReentrant {
    uint256 amt = pendingWithdrawals[msg.sender];
    if (amt==0) revert InvalidAmount();
    pendingWithdrawals[msg.sender]=0;
    (bool ok,)=payable(msg.sender).call{value:amt}(""); if(!ok) revert TransferFailed();
}
```
Replace the fee sends in `buyKeys`/`sellKeys` with `_credit(protocolFeeDestination, …)`
and `_credit(subject, …)`. Keep the seller's own payout as a direct send.

### 🟠 H-1 — A bad `protocolFeeDestination` halts ALL trades contract-wide
Same push-payment flaw for the protocol fee: if `protocolFeeDestination` becomes
un-receivable, every market freezes at once. Recoverable (owner can `setFees` to a
good address or set `protocolFeeBps=0`), hence High not Critical. The same
`_credit` pull-payment fix removes it.

### 🟡 M-1 — No slippage protection (sandwich / front-run / fee front-run)
`buyKeys` has no `maxCost` and `sellKeys` has no `minProceeds`, and both quote at
execution-time supply. An attacker can push the quadratic curve up before your
buy (you overpay out of your `msg.value`) or dump before your sell. The owner can
also raise fees to 20% and front-run trades. **Fix:** add `maxCost`/`minProceeds`
params and revert if the quote crosses them.

### 🟡 M-2 — Overpay refund is a push (can block contract/smart-wallet buyers)
`buyKeys` refunds surplus via low-level call; a buyer whose wallet rejects native
value can't buy. Credit the refund via `pendingWithdrawals` instead (or, once M-1
adds `maxCost`, it becomes self-inflicted and acceptable).

### 🔵 L-1 — Single-step `transferOwnership`
A wrong address permanently loses owner control. Use two-step (`pendingOwner` +
`acceptOwnership`).

### 🔵 L-2 — Anyone can open a market for a non-consenting `subject`; first key is free
`getPrice(0)==0`, so the first key of any address mints for zero. Markets can be
created for addresses that never opted in (and if that address can't receive
value, see C-1). Consider requiring `_profiles[subject].exists` and letting the
subject buy key #1.

### 🔵 L-3 — `updateProfile` unbounded strings
No length limits on `name`/`handle`/`avatarURI`; add max-length checks to bound
storage/log cost. (Caller pays gas, so mostly self-griefing.)

### ⚪ Informational (verified / awareness)
- **Reentrancy: OK.** `nonReentrant` on both trades; checks-effects-interactions
  respected (balances/supply updated before external calls); lock resets on revert.
- **Solvency: OK.** Reserve always equals Σ price of outstanding keys.
- **Privacy.** `updateProfile` stores cleartext; `sendMessage` emits messages in
  logs — world-readable forever. Key-gating controls *who can post*, not *who can
  read*. Don't market these as private DMs; encrypt off-chain + store only a hash.
- **Overflow / gas.** `getPrice` overflow is unreachable in practice; loops are
  bounded by `MAX_BATCH_SIZE=50`.
- **Fee timelock.** `setFees` is instant within [0, 20%]; consider a timelock.

---

## Frontend & config

### 🔵 F-1 — Attacker-controlled `avatarURI` rendered as `<img src>`
Profile `avatarURI` comes from on-chain (any wallet can set any URL) and is used
directly as an image source. Not script-executable in React, but it can load
arbitrary external content (tracking pixels, oversized images). **Fix:** validate
the scheme before rendering — allow only `https:` and `data:image/…`, else fall
back to the generated avatar. Names/handles/messages are rendered as text and are
safely escaped by React (no XSS).

### 🔵 F-2 — Private-key handling for deploy
The frontend correctly never touches private keys (all signing via the injected
wallet). For deploying/scripts, avoid a raw `PRIVATE_KEY` in `.env` — use a
Foundry keystore (`cast wallet import`, then `--account`). Use a throwaway
deployer wallet, not your main one.

### ⚪ F-3 — Dependency hygiene
Run `npm audit` periodically. Pin dependencies; the current set (React 19, ethers
6, vite, lucide) is mainstream with no known critical issues at time of audit.

### ⚪ F-4 — Bridge (CCTP) looks sound
Approves the **exact** amount (not unlimited), mints to your own address, uses
Circle's canonical CCTP v2 contracts. No secrets involved. Fine.

---

## Recommended remediation order

1. **Done:** `.gitignore` (C-0). Rotate the deploy key if a `.env` was ever committed.
2. **Before handling any real value:** fix **C-1 + H-1** with pull-payments — this
   is the headline risk (permanent fund lock). Requires a contract **redeploy**.
3. Add **M-1** slippage params (`maxCost`/`minProceeds`) — redeploy + small
   frontend change to the buy/sell calls.
4. **M-2 / L-1 / L-2 / L-3** hardening in the same redeploy.
5. **F-1** avatar scheme validation (frontend only, no redeploy).

> Fixing C-1/M-1 changes function signatures, so it means deploying a **new**
> contract (new address; current on-chain profiles/trades won't carry over) and
> re-verifying. On testnet that's cheap. Worth doing before you invite real users.
