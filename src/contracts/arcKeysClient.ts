import { ethers } from 'ethers';
import { ARC_KEYS_ABI, ARC_KEYS_CONTRACT_ADDRESS } from './arcKeys';

/**
 * Read strategy (browser-safe):
 *  - eth_call reads (getProfile, totalSupply, balanceOf, pendingWithdrawals) use
 *    the wallet's injected provider (window.ethereum) — no CORS, and the wallet
 *    is on Arc during normal use.
 *  - event/log reads (creators, trade history) use the ArcScan REST API, which
 *    the browser can call cross-origin. A direct RPC getLogs from the browser is
 *    blocked by CORS, which is why on-chain profiles/feed weren't showing.
 */
const ARC_RPC_URL = 'https://rpc.testnet.arc.network';
const ARCSCAN_API = 'https://testnet.arcscan.app/api';

// Block the ArcKeys contract was deployed at. Log queries start here.
export const ARC_KEYS_DEPLOY_BLOCK = 53763822; // ArcKeys v2 deploy block

let _rpcProvider: ethers.JsonRpcProvider | null = null;
/** Provider for eth_call reads: prefer the wallet (no CORS), else the Arc RPC. */
export const getArcProvider = (): ethers.Provider => {
  if (typeof window !== 'undefined' && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  if (!_rpcProvider) _rpcProvider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  return _rpcProvider;
};

interface ArcscanLog {
  topics: (string | null)[]; // ArcScan pads unused topics with null
  data: string;
  transactionHash?: string;
  blockNumber?: string;
}

/** ArcScan pads topics to 4 with null; keep only the real hex topics for ethers. */
const cleanTopics = (topics: (string | null)[]): string[] =>
  (topics ?? []).filter((t): t is string => typeof t === 'string' && t.startsWith('0x'));

/** Fetch this contract's event logs for `topic0` via the ArcScan REST API (CORS-safe). */
const arcscanGetLogs = async (topic0: string): Promise<ArcscanLog[]> => {
  const url =
    `${ARCSCAN_API}?module=logs&action=getLogs` +
    `&fromBlock=${ARC_KEYS_DEPLOY_BLOCK}&toBlock=latest` +
    `&address=${ARC_KEYS_CONTRACT_ADDRESS}&topic0=${topic0}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as { status?: string; result?: unknown };
  return Array.isArray(json.result) ? (json.result as ArcscanLog[]) : [];
};

const toBlockNumber = (v: string | undefined): number =>
  !v ? 0 : v.startsWith('0x') ? parseInt(v, 16) : Number(v);

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
): Promise<ethers.TransactionResponse> => {
  // Quote via the signer's own (on-Arc) provider to avoid a wrong-network read.
  const { net } = await quoteBuy(signer.provider ?? getArcProvider(), subject, amount);
  const contract = getWriteContract(signer);
  // Send EXACTLY the quoted cost as value, and use it as maxCost. This needs only
  // `net` USDC in the wallet (no extra buffer that would inflate the balance
  // required and cause an estimate-gas revert when funds are just enough).
  return contract.buyKeys(subject, amount, net, { value: net });
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
  const { net } = await quoteSell(signer.provider ?? getArcProvider(), subject, amount);
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

let _iface: ethers.Interface | null = null;
const keysInterface = (): ethers.Interface => {
  if (!_iface) _iface = new ethers.Interface(ARC_KEYS_ABI);
  return _iface;
};
const TRADE_TOPIC = ethers.id('Trade(address,address,bool,uint256,uint256,uint256,uint256,uint256)');
const PROFILE_UPDATED_TOPIC = ethers.id('ProfileUpdated(address,string,string,string)');

const decodeTradeLog = (log: ArcscanLog): TradeEvent | null => {
  try {
    const parsed = keysInterface().parseLog({ topics: cleanTopics(log.topics), data: log.data });
    if (!parsed) return null;
    const a = parsed.args;
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
      blockNumber: toBlockNumber(log.blockNumber),
    };
  } catch {
    return null;
  }
};

/** Backfill Trade events from the ArcScan logs API (browser/CORS-safe). */
export const getTradeHistory = async (
  _provider?: ethers.Provider,
): Promise<TradeEvent[]> => {
  const logs = await arcscanGetLogs(TRADE_TOPIC);
  return logs.map(decodeTradeLog).filter((t): t is TradeEvent => t !== null);
};

/**
 * Poll for new Trade events every 15s (ArcScan-based; browser-safe). Returns an
 * unsubscribe function. The first poll seeds the "seen" set without firing, so
 * only genuinely new trades reach the handler.
 */
export const watchTrades = (
  _provider: ethers.Provider,
  handler: (event: TradeEvent) => void,
): (() => void) => {
  let stopped = false;
  let seeded = false;
  const seen = new Set<string>();
  const tick = async () => {
    if (stopped) return;
    try {
      const trades = await getTradeHistory();
      for (const t of trades) {
        const key = `${t.txHash ?? ''}-${t.subject}-${t.trader}-${t.blockNumber ?? 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (seeded) handler(t);
      }
      seeded = true;
    } catch {
      // ignore; retry next tick
    }
    if (!stopped) setTimeout(tick, 15000);
  };
  void tick();
  return () => {
    stopped = true;
  };
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
  _provider?: ethers.Provider,
): Promise<OnchainCreator[]> => {
  const logs = await arcscanGetLogs(PROFILE_UPDATED_TOPIC);

  // Keep only the latest profile per address (logs come back in block order).
  const latest = new Map<string, OnchainCreator>();
  for (const log of logs) {
    try {
      const parsed = keysInterface().parseLog({ topics: cleanTopics(log.topics), data: log.data });
      if (!parsed) continue;
      const address: string = parsed.args.subject ?? parsed.args[0];
      if (!address) continue;
      latest.set(address.toLowerCase(), {
        address,
        name: parsed.args.name ?? parsed.args[1] ?? '',
        handle: parsed.args.handle ?? parsed.args[2] ?? '',
        avatar: parsed.args.avatarURI ?? parsed.args[3] ?? '',
        supply: 0,
      });
    } catch {
      // skip undecodable log
    }
  }

  const provider = getArcProvider();
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
