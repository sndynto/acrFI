# Deploying ArcKeys.sol to Arc Testnet

This uses **Foundry** (the raw-Solidity path Arc's docs recommend for custom
contracts). Everything runs against Arc Testnet — chain ID **5042002**, where
**USDC is the native gas token**.

## 1. Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## 2. Add the forge-std library

From the project root (`D:\arc`), your git repo already exists, so:

```bash
forge install foundry-rs/forge-std
```

This creates `lib/forge-std/`. (If you don't want it committed as a submodule,
add `--no-git`.)

## 3. Configure environment

Copy `.env.example` to `.env` and fill it in:

```ini
# RPC + deploy key (Foundry)
ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
PRIVATE_KEY="0xYOUR_DEPLOYER_PRIVATE_KEY"
# Optional: where the 5% protocol fee goes. Defaults to the deployer address.
PROTOCOL_FEE_DESTINATION="0xYOUR_FEE_WALLET"

# Frontend (Vite) — set this AFTER deploying (step 5)
VITE_ARC_KEYS_CONTRACT_ADDRESS=
```

Generate a fresh deployer key if you need one: `cast wallet new`.
Fund that address with testnet USDC from the faucet: https://faucet.circle.com

> Security: never commit `.env` or a real private key. `.gitignore` already
> ignores `.env`. For extra safety, use `cast wallet import` + `--account`
> instead of a raw `PRIVATE_KEY` in the file.

## 4. Build & test

```bash
forge build
forge test        # optional; add tests under test/ if you want
```

## 5. Deploy

```bash
source .env   # macOS/Linux; on Windows PowerShell set the vars or use a .env loader

forge script script/DeployArcKeys.s.sol:DeployArcKeys \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --broadcast
```

The script prints:

```
ArcKeys deployed at: 0x....
```

If a broadcast is rejected as **"transaction underpriced"**, Arc's 20 Gwei
base-fee floor is biting — re-run with an explicit floor:

```bash
forge script script/DeployArcKeys.s.sol:DeployArcKeys \
  --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast \
  --with-gas-price 20000000000
```

## 6. Wire the frontend

Put the deployed address into `.env`:

```ini
VITE_ARC_KEYS_CONTRACT_ADDRESS=0xYourDeployedContract
```

Restart Vite (`npm run dev`). The app auto-detects the address via
`isArcKeysDeployed()` and switches buy / sell / chat from the prototype
value-transfer fallback to real `buyKeys` / `sellKeys` / `sendMessage` calls.

## 7. Verify it works

- Buy a key of a creator address that exists on-chain (needs a real address, not
  a mock profile). Check the tx on https://testnet.arcscan.app
- Read supply back: `cast call <CONTRACT> "totalSupply(address)(uint256)" <SUBJECT> --rpc-url $ARC_TESTNET_RPC_URL`

## Notes specific to Arc

- **Test against the real RPC**, not `anvil` — a local fork runs standard EVM and
  won't reproduce Arc's native-USDC precompiles, EIP-7708 `Transfer` events, or
  blocklist rules.
- The **first key of any subject costs 0** (curve is `supply² / 100`, so supply 0
  → price 0). Expected, per the contract README.
- When you build the activity-feed indexer, filter events by **this contract's
  address + the `Trade` topic**. Arc emits its own ERC-20 `Transfer` logs from a
  system emitter (18 decimals) for every native USDC move — don't count those.
