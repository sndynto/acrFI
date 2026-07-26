# arcFI Smart Contract

The first on-chain contract for arcFI is `ArcKeys.sol`.

## What It Does

- Lets any wallet create or update its public creator profile.
- Lets users buy and sell ARCKEYS for a subject address.
- Prices keys with the same prototype curve used by the frontend: `supply^2 / 100`.
- Charges a default 10% total fee split into:
  - 5% protocol fee
  - 5% creator fee
- Emits events for trading, profile updates, fee updates, ownership, and holder-gated messages.
- Allows chat messages only when the sender owns at least one key for the subject, or when the sender is the subject.

## Core Methods

Read methods:

```solidity
getPrice(uint256 supply)
getBuyPrice(address subject, uint256 amount)
getSellPrice(address subject, uint256 amount)
getBuyPriceAfterFee(address subject, uint256 amount)
getSellPriceAfterFee(address subject, uint256 amount)
getProfile(address subject)
totalSupply(address subject)
balanceOf(address subject, address holder)
```

Write methods:

```solidity
updateProfile(string name, string handle, string avatarURI)
buyKeys(address subject, uint256 amount)
sellKeys(address subject, uint256 amount)
sendMessage(address subject, string message)
```

Admin methods:

```solidity
setFees(address newProtocolFeeDestination, uint256 newProtocolFeeBps, uint256 newCreatorFeeBps)
transferOwnership(address newOwner)
```

## Deployment Notes

Compile the contract with Solidity `0.8.24` or newer within the `0.8.x` line.

Constructor argument:

```solidity
address initialProtocolFeeDestination
```

After deploy, set the frontend environment variable:

```bash
VITE_ARC_KEYS_CONTRACT_ADDRESS=0xYourDeployedContract
```

## Current Design Tradeoffs

- The first key for a new subject costs `0`, because the curve follows the frontend formula exactly.
- Holder lists are not enumerable on-chain. Use the `Trade` event as the source for an indexer/feed.
- Messages are stored in event logs. For private chat, use encrypted off-chain storage and put only proofs or pointers on-chain.
- The contract uses native value transfers. On Arc, native gas/value denomination should match the network wallet display.
