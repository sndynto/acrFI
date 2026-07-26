# USDC Bridge — self-contained (Circle CCTP v2, no extra packages)

The bridge is **built directly on Circle CCTP v2 using ethers** — the same
`ethers` already in the project. **Nothing extra to install**, no `@circle-fin`
packages, no npm changes. It's live as soon as you restart the dev server.

## What it does

Click **Bridge USDC to Arc** (Profile), pick a source chain + amount, and it:

1. **approve** — approves USDC to the CCTP TokenMessenger on the source chain
2. **burn** — `depositForBurn` (Standard transfer) to Arc's CCTP domain (26)
3. **attestation** — polls Circle's attestation service for the burn
4. **mint** — switches your wallet to Arc and calls `receiveMessage` to mint USDC

Each step shows a colored status pill + a tx link in the modal.

## Requirements

- Your wallet must hold **test USDC on the source chain** (Base Sepolia,
  Ethereum Sepolia, Arbitrum Sepolia, or Avalanche Fuji). Get some from
  https://faucet.circle.com (choose the source chain).
- A little **native gas** on the source chain (ETH/AVAX) for approve + burn, and
  a little on Arc for the mint (USDC-gas from https://faucet.circle.com).
- The wallet will prompt to **switch networks** during the flow (source → Arc);
  approve those prompts. Unknown chains are added automatically.

## Notes

- **Standard transfers are free but not instant** — the attestation can take a
  few minutes (the modal polls up to ~12 min). If it times out, your burn still
  succeeded; run the bridge again shortly to finish the mint.
- Testnet only. USDC is 6-decimals on the source chains; amounts are entered as
  plain decimals (e.g. `1.00`).
- CCTP v2 contracts share one address across chains:
  TokenMessengerV2 `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`,
  MessageTransmitterV2 `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`.
- If the attestation fetch is blocked by CORS in your browser, the burn still
  lands; you can complete the mint from any CCTP tool. (In practice Circle's
  sandbox API allows browser requests.)

No configuration needed — just restart `npm run dev`.
