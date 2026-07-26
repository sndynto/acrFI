# arcFI

**arcFI** is a SocialFi prototype built for the **Arc Network** testnet. It lets users connect an EVM wallet, discover creator or agent profiles, simulate ARCKEY trades, view ArcScan-backed wallet activity, and open holder-gated chatrooms.

This repository currently contains the React frontend only. ARCKEY ownership, bonding-curve settlement, holder verification, and chat gating are implemented as frontend prototype state plus direct wallet transactions, not as a deployed smart contract integration yet.

## Powered by Arc Network

arcFI is designed around Arc Network's stablecoin-native, EVM-compatible testnet experience.

Key infrastructure assumptions:

- **USDC native gas**: Arc uses USDC as the native gas token.
- **Fast finality**: Transactions are intended to settle quickly on testnet.
- **EVM compatibility**: The app uses standard EVM wallet flows through Ethers.js.
- **ArcScan visibility**: Wallet activity is read from the ArcScan testnet API.

## Application Features

### Wallet Login

- Connects to an injected EVM wallet such as MetaMask.
- Requests account access with `eth_requestAccounts`.
- Attempts to switch to Arc Testnet.
- Adds Arc Testnet automatically when the wallet returns chain-not-found error `4902`.
- Mock social login buttons create local test addresses for UI exploration.

### ARCKEYS Prototype Trading

- Shows creators and agents in an Explore view.
- Prices ARCKEYS with a simple bonding curve: `supply^2 / 100`.
- Buy flow opens a confirmation modal with price, 10% fee, and total.
- Buy submits an EVM transaction, then updates local supply, holdings, and feed state.
- Sell removes one local holding and submits a small prototype settlement transaction.

### Home Feed

- Shows mock SocialFi trades plus recent wallet activity fetched from ArcScan.
- Global feed shows all available trades.
- Following feed shows activity for profiles the user currently holds.

### Holder-Gated Chatrooms

- Buying an ARCKEY adds the profile to the user's chatroom list.
- Messages can be sent on-chain as UTF-8 transaction calldata when the selected profile has a real wallet address.
- Incoming transaction calldata is decoded from ArcScan results when possible.

### Profile Dashboard

- Displays wallet balance.
- Lets the user edit local display name and handle.
- Shows held ARCKEYS grouped by profile.
- Shows real addresses that have interacted with the connected wallet.
- Includes an empty watchlist placeholder.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Styling**: Vanilla CSS
- **Web3**: Ethers.js v6
- **Contract**: Solidity `0.8.24`
- **Network**: Arc Testnet, chain ID `5042002`

## Smart Contract

The first contract lives in [`contracts/ArcKeys.sol`](contracts/ArcKeys.sol).

It includes:

- Creator profile updates.
- ARCKEY buy and sell functions.
- Quadratic bonding-curve pricing.
- Protocol and creator fee split.
- Trade events for indexing the activity feed.
- Holder-gated message events.

Frontend ABI helpers live in [`src/contracts/arcKeys.ts`](src/contracts/arcKeys.ts). After deploying the contract, copy `.env.example` to `.env` and set:

```bash
VITE_ARC_KEYS_CONTRACT_ADDRESS=0xYourDeployedContract
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

## Wallet Configuration

| Parameter | Value |
| --- | --- |
| Network Name | Arc Testnet |
| RPC URL | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` (`0x4CEF52`) |
| Currency Symbol | `USDC` |
| Block Explorer | `https://testnet.arcscan.app` |

## Current Limitations

- The frontend still needs to be wired to the new smart contract.
- ARCKEY balances in the current UI are still local frontend state until contract calls replace the prototype transfer flow.
- Holders in the current UI are inferred from wallet interactions until the `Trade` event is indexed.
- Social login buttons are mock UI shortcuts, not OAuth authentication.
- Production chat should use encryption or off-chain storage rather than public plaintext event logs.

## Resources

- [Arc Network Docs](https://docs.arc.network)
- [Arc Website](https://arc.network)
- [Arc on X](https://x.com/arc)
- [Arc Discord](https://discord.com/invite/buildonarc)

(c) 2026 arcFI. Built on Arc Network.
