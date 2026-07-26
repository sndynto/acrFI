# Verifying ArcKeys.sol on ArcScan

Verifying publishes your source code on the explorer so anyone can read it and
interact via a "Read/Write Contract" tab. It's the clearest possible signal that
you're a real builder (not a bot). `ArcKeys.sol` has **no imports** — it's a
single self-contained file — so verification is easy.

**Compiler settings used (from `foundry.toml`):**
- Solidity version: **0.8.24**
- Optimizer: **enabled**, **200 runs**
- License: **MIT**
- Constructor argument: one `address` (`initialProtocolFeeDestination`)

First, find the constructor argument you deployed with (the protocol fee wallet).
If you didn't set `PROTOCOL_FEE_DESTINATION`, it defaults to your deployer address.
Read it back from the contract to be sure:

```bash
cast call <CONTRACT_ADDRESS> "protocolFeeDestination()(address)" \
  --rpc-url https://rpc.testnet.arc.network
```

## Option A — Verify with Foundry (recommended)

ArcScan is a Blockscout-style explorer, so `forge verify-contract` works:

```bash
forge verify-contract <CONTRACT_ADDRESS> contracts/ArcKeys.sol:ArcKeys \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://testnet.arcscan.app/api/ \
  --compiler-version v0.8.24 \
  --num-of-optimizations 200 \
  --constructor-args $(cast abi-encode "constructor(address)" <PROTOCOL_FEE_DESTINATION>)
```

If the verifier URL is rejected, try `https://testnet.arcscan.app/api?` or check
the exact "API" URL on the ArcScan footer/docs, then re-run.

## Option B — Manual, via the ArcScan UI (fallback)

1. Open `https://testnet.arcscan.app/address/<CONTRACT_ADDRESS>`
2. Go to the **Contract** tab → **Verify & Publish**
3. Choose: **Via flattened source code** / **Solidity (single file)**
4. Set:
   - Compiler: **v0.8.24+commit...** (pick the 0.8.24 build)
   - Optimization: **Yes**, Runs: **200**
   - License: **MIT**
5. Paste the entire contents of `contracts/ArcKeys.sol`
6. **Constructor Arguments (ABI-encoded)** — paste the value below **without the
   leading `0x`**. Generate it with:

   ```bash
   cast abi-encode "constructor(address)" <PROTOCOL_FEE_DESTINATION>
   ```

   It looks like `000000000000000000000000<40-hex-of-the-address>`.
7. Submit. On success the contract shows a green check and a Read/Write tab.

## After verifying

- Do a couple of real interactions from the verified Read/Write tab (e.g.
  `updateProfile`, `buyKeys`) so there's on-chain activity tied to a verified
  contract.
- Keep activity spread across several days rather than one burst.
