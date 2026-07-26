import { ethers } from 'ethers';
import { ARC_KEYS_ABI, ARC_KEYS_CONTRACT_ADDRESS } from './arcKeys';

/**
 * Dedicated read provider pointing at Arc's public RPC. Use this (not the wallet's
 * injected provider) for all reads — especially queryFilter/getLogs — because
 * wallet RPCs (e.g. MetaMask) often cap the eth_getLogs block range and reject
 * full-history queries. Writes still go through the wallet signer.
 */
const ARC_RPC_URL = 'https://rpc.testnet.arc.network';

// Block the ArcKeys contract was deployed at. Event queries start here (not 0)
// so the RPC never rejects an over-wide eth_getLogs range.
export const ARC_KEYS_DEPLOY_BLOCK = 53763822; // ArcKeys v2 deploy block

let _arcProvider: ethers.JsonRpcProvider | null = null;
export const getArcProvider = (): ethers.JsonRpcProvider => {
  if (!_arcProvider) _arcProvider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  return _arcProvider;
};

/**
 * Thin ethers v6 wrapper around the deployed ArcKeys contract.
 *
 * On Arc, USDC is the native gas token (18 decimals), so `msg.value` and all
 * prices returned by the contract are already in 18-decimal native USDC "wei".
 * Use ethers.formatEther() to display them and ethers.parseEther() to build them.
 *
 * Every write path in the UI falls back to the old prototype behaviour when the
 * contract address is not yet configured, so the app keeps working before deploy.
 */

/** True once VITE_ARC_KEYS_CONTRACT_ADDRESS points at a real address. */
export const isArcKeysDeployed = (): boolean =>
  ethers.isAddress(ARC_KEYS_CONTRACT_ADDRESS) &&
  ARC_KEYS_CONTRACT_ADDRESS !== ethers.ZeroAddress;

export const getReadContract = (provider: ethers.Provider): ethers.Contract =>
  new ethers.Contract(ARC_KEYS_CONTRACT_ADDRESS, ARC_KEYS_ABI, provider);

export const getWriteContract = (signer: ethers.Signer): ethers.Contract =>
  new ethers.Contract(ARC_KEYS_CONTRACT_ADDRESS, ARC_KEYS_ABI, signer);

export interface KeyQuote {
  /** Amount the buyer pays / seller receives, in 18-decimal native USDC wei. */
  net: bigint;
  grossPrice: bigint;
  protocolFee: bigint;
  creatorFee: bigint;
}

/** Buy quote: net = grossPrice + protocolFee + creatorFee. */
export const quoteBuy = async (
  provider: ethers.Provider,
  subject: string,
  amount: bigint = 1n,
): Promise<KeyQuote> => {
  const contract = getReadContract(provider);
  const [total, grossPrice, protocolFee, creatorFee] =
    await contract.getBuyPriceAfterFee(subject, amount);
  return { net: total, grossPrice, protocolFee, creatorFee };
};

/** Sell quote: net = grossPrice - protocolFee - creatorFee. */
export const quoteSell = async (
  provider: ethers.Provider,
  subject: string,
  amount: bigint = 1n,
): Promise<KeyQuote> => {
  const contract = getReadContract(provider);
  const [payout, grossPrice, protocolFee, creatorFee] =
    await contract.getSellPriceAfterFee(subject, amount);
  return { net: payout, grossPrice, protocolFee, creatorFee };
};

/**
 * Buy `amount` keys of `subject` with slippage protection (v2).
 * Quotes via the Arc RPC, then passes a `maxCost` = quote + `slippageBps` and
 * sends that as msg.value; the contract charges the real price and refunds the
 * surplus, or reverts if the price moved beyond maxCost.
 */
export const buyKeys = async (
  signer: ethers.Signer,
  subject: string,
  amount: bigint = 1n,
  slippageBps: bigint = 200n, // 2%
): Promise<ethers.TransactionResponse> => {
  const { net } = await quoteBuy(getArcProvider(), subject, amount);
  const maxCost = net + (net * slippageBps) / 10_000n;
  const contract = getWriteContract(signer);
  return contract.buyKeys(subject, amount, maxCost, { value: maxCost });
};

/**
 * Sell `amount` keys of `subject` with slippage protection (v2).
 * Passes `minProceeds` = quote − `slippageBps`; the contract reverts if proceeds
 * would fall below it. Reverts on-chain if the caller holds fewer keys.
 */
export const sellKeys = async (
  signer: ethers.Signer,
  subject: string,
  amount: bigint = 1n,
  slippageBps: bigint = 200n, // 2%
): Promise<ethers.TransactionResponse> => {
  const { net } = await quoteSell(getArcProvider(), subject, amount);
  const minProceeds = net - (net * slippageBps) / 10_000n;
  const contract = getWriteContract(signer);
  return contract.sellKeys(subject, amount, minProceeds);
};

/** Withdraw accumulated pull-payment balance (creator/protocol fees) to the caller. */
export const withdraw = async (
  signer: ethers.Signer,
): Promise<ethers.TransactionResponse> => {
  const contract = getWriteContract(signer);
  return contract.withdraw();
};

/** Read the caller's withdrawable (pending) balance, in 18-decimal native USDC wei. */
export const pendingWithdrawalOf = async (
  provider: ethers.Provider,
  account: string,
): Promise<bigint> => {
  const contract = getReadContract(provider);
  return contract.pendingWithdrawals(account);
};

/** Post a holder-gated message. Reverts unless caller holds a key of `subject`. */
export const sendMessage = async (
  signer: ethers.Signer,
  subject: string,
  message: string,
): Promise<ethers.TransactionResponse> => {
  const contract = getWriteContract(signer);
  return contract.sendMessage(subject, message);
};

/** Create/update the caller's on-chain creator profile. */
export const updateProfile = async (
  signer: ethers.Signer,
  name: string,
  handle: string,
  avatarURI: string,
): Promise<ethers.TransactionResponse> => {
  const contract = getWriteContract(signer);
  return contract.updateProfile(name, handle, avatarURI);
};

/** How many keys `holder` owns of `subject` (integer count). */
export const keyBalanceOf = async (
  provider: ethers.Provider,
  subject: string,
  holder: string,
): Promise<bigint> => {
  const contract = getReadContract(provider);
  return contract.balanceOf(subject, holder);
};

/** Current key supply for `subject` (integer count). */
export const totalSupplyOf = async (
  provider: ethers.Provider,
  subject: string,
): Promise<bigint> => {
  const contract = getReadContract(provider);
  return contract.totalSupply(subject);
};

export interface OnchainProfile {
  name: string;
  handle: string;
  avatarURI: string;
  exists: boolean;
}

export const getProfile = async (
  provider: ethers.Provider,
  subject: string,
): Promise<OnchainProfile> => {
  const contract = getReadContract(provider);
  const [name, handle, avatarURI, exists] = await contract.getProfile(subject);
  return { name, handle, avatarURI, exists };
};

/** A decoded ArcKeys `Trade` event. All amounts are 18-decimal native USDC wei. */
export interface TradeEvent {
  trader: string;
  subject: string;
  isBuy: boolean;
  amount: bigint;
  grossPrice: bigint;
  protocolFee: bigint;
  creatorFee: bigint;
  supply: bigint;
  txHash?: string;
  blockNumber?: number;
}

/**
 * Subscribe to live Trade events. Returns an unsubscribe function.
 * Filter is scoped to THIS contract address, so it never picks up Arc's
 * EIP-7708 native Transfer logs (which come from the system emitter).
 */
export const watchTrades = (
  provider: ethers.Provider,
  handler: (event: TradeEvent) => void,
): (() => void) => {
  const contract = getReadContract(provider);
  const listener = (
    trader: string,
    subject: string,
    isBuy: boolean,
    amount: bigint,
    grossPrice: bigint,
    protocolFee: bigint,
    creatorFee: bigint,
    supply: bigint,
    // ethers v6 passes a ContractEventPayload as the final argument.
    payload?: { log?: { transactionHash?: string; blockNumber?: number } },
  ) =>
    handler({
      trader,
      subject,
      isBuy,
      amount,
      grossPrice,
      protocolFee,
      creatorFee,
      supply,
      txHash: payload?.log?.transactionHash,
      blockNumber: payload?.log?.blockNumber,
    });

  void contract.on('Trade', listener);
  return () => {
    void contract.off('Trade', listener);
  };
};

/**
 * Backfill historical Trade events via getLogs. Use to seed the feed on load.
 * `fromBlock` defaults to 0; pass a recent block if the RPC caps log ranges.
 */
export const getTradeHistory = async (
  provider: ethers.Provider,
  fromBlock: number | bigint = ARC_KEYS_DEPLOY_BLOCK,
  toBlock: number | bigint | 'latest' = 'latest',
): Promise<TradeEvent[]> => {
  const contract = getReadContract(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs: any[] = await contract.queryFilter(
    contract.filters.Trade(),
    fromBlock,
    toBlock,
  );
  return logs.map((log) => {
    const a = log.args ?? {};
    return {
      trader: a.trader ?? a[0],
      subject: a.subject ?? a[1],
      isBuy: a.isBuy ?? a[2],
      amount: a.amount ?? a[3],
      grossPrice: a.grossPrice ?? a[4],
      protocolFee: a.protocolFee ?? a[5],
      creatorFee: a.creatorFee ?? a[6],
      supply: a.supply ?? a[7],
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
    } as TradeEvent;
  });
};

export interface OnchainCreator {
  address: string;
  name: string;
  handle: string;
  avatar: string;
  supply: number;
}

/**
 * Build the real creator list from ProfileUpdated events (latest profile per
 * address), each with its current on-chain key supply. This is how a profile
 * edited by ANY wallet shows up for everyone — it's read from chain, not local.
 */
export const getCreators = async (
  provider: ethers.Provider,
  fromBlock: number | bigint = ARC_KEYS_DEPLOY_BLOCK,
): Promise<OnchainCreator[]> => {
  const contract = getReadContract(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs: any[] = await contract.queryFilter(
    contract.filters.ProfileUpdated(),
    fromBlock,
    'latest',
  );

  // Keep only the latest profile per address (events arrive in block order).
  const latest = new Map<string, OnchainCreator>();
  for (const log of logs) {
    const a = log.args ?? {};
    const address: string = a.subject ?? a[0];
    if (!address) continue;
    latest.set(address.toLowerCase(), {
      address,
      name: a.name ?? a[1] ?? '',
      handle: a.handle ?? a[2] ?? '',
      avatar: a.avatarURI ?? a[3] ?? '',
      supply: 0,
    });
  }

  return Promise.all(
    Array.from(latest.values()).map(async (creator) => {
      try {
        creator.supply = Number(await totalSupplyOf(provider, creator.address));
      } catch {
        // leave supply at 0 if unreadable
      }
      return creator;
    }),
  );
};
