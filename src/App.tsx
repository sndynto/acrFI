import { useEffect, useState } from 'react';
import { Home, Search, MessageCircle, User, Settings, X, LogOut } from 'lucide-react';
import { ethers } from 'ethers';
import LandingPage from './LandingPage';
import BridgePanel from './BridgePanel';
import {
  isArcKeysDeployed,
  buyKeys,
  sellKeys,
  sendMessage as sendKeyMessage,
  totalSupplyOf,
  keyBalanceOf,
  watchTrades,
  getTradeHistory,
  getProfile,
  updateProfile,
  getCreators,
  getArcProvider,
  withdraw,
  pendingWithdrawalOf,
  type TradeEvent,
} from './contracts/arcKeysClient';
import './index.css';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

interface UserProfile {
  id: number | string;
  name: string;
  handle: string;
  avatar: string;
  supply: number;
  address?: string;
}

interface Trade {
  id: number | string;
  buyer: string;
  buyerAvatar: string;
  subject: string;
  subjectAvatar: string;
  action: 'bought' | 'sold' | 'sent' | 'received';
  amount: number | string;
  price: string;
  time: string;
}

interface Holder {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  address: string;
}

interface ChatMessage {
  text: string;
  sender: 'me' | 'them';
  time: string;
}

interface ArcScanTx {
  from: string;
  to: string;
  value: string;
  input: string;
  timeStamp: string;
  hash?: string;
}

interface ArcScanResponse {
  status: string;
  result: ArcScanTx[] | string;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const ARC_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MOCK_TRADES: Trade[] = [
  { id: 1, buyer: 'Sandi', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sandi', subject: 'Arc Network', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc', action: 'bought', amount: 1, price: '0.05 ARC', time: '2m ago' },
  { id: 2, buyer: 'Alice', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice', subject: 'Bob', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob', action: 'sold', amount: 1, price: '0.12 ARC', time: '5m ago' },
  { id: 3, buyer: 'Charlie', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie', subject: 'Sandi', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sandi', action: 'bought', amount: 2, price: '0.80 ARC', time: '15m ago' },
  { id: 4, buyer: 'Arc Builder', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc', subject: 'Alice', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice', action: 'bought', amount: 5, price: '2.50 ARC', time: '1h ago' },
];

const MOCK_EXPLORE: UserProfile[] = [
  { id: 1, name: 'Sandi', handle: '@sandi_dev', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sandi', supply: 5 },
  { id: 2, name: 'Arc Builder', handle: '@arc_network', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc', supply: 12 },
  { id: 3, name: 'Alice', handle: '@alice_web3', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice', supply: 8 },
];

const formatAddress = (address: string) => `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

const getPrice = (supply: number) => {
  if (supply <= 0) return 0;
  return (supply * supply) / 100;
};

const getSupplyFromAddress = (address: string) => {
  const seed = Number.parseInt(address.slice(2, 8), 16);
  if (Number.isNaN(seed)) return 5;
  return (seed % 15) + 5;
};

const getTradeActionMeta = (action: Trade['action']) => {
  if (action === 'bought') return { className: 'buy-action', label: 'Buy' };
  if (action === 'sold') return { className: 'sell-action', label: 'Sell' };
  if (action === 'sent') return { className: 'sell-action', label: 'Sent' };
  return { className: 'buy-action', label: 'Received' };
};

const avatarFor = (seed: string) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;

// F-1: avatarURI comes from on-chain (any wallet can set any string), and is
// rendered as <img src>. Only allow https: / data:image URLs; otherwise fall
// back to a generated avatar so a malicious URL can't be loaded.
const isSafeAvatar = (url: string | undefined): url is string =>
  !!url && (/^https:\/\//i.test(url) || /^data:image\//i.test(url));
const safeAvatar = (url: string | undefined, fallbackSeed: string): string =>
  isSafeAvatar(url) ? url : avatarFor(fallbackSeed);

const ARC_CHAIN_ID_HEX = '0x4CEF52'; // 5042002

// Ensure the wallet is on Arc Testnet before any on-chain write. Transactions
// (buy/sell/profile/withdraw) must run on Arc; if the wallet drifted to another
// network (e.g. after bridging), switch it back (adding the chain if unknown).
const ensureArcNetwork = async (ethereum: EthereumProvider): Promise<void> => {
  const current = (await ethereum.request({ method: 'eth_chainId' })) as string;
  if (current?.toLowerCase() === ARC_CHAIN_ID_HEX.toLowerCase()) return;
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_CHAIN_ID_HEX }] });
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_ID_HEX,
          chainName: 'Arc Testnet',
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
          rpcUrls: ['https://rpc.testnet.arc.network'],
          blockExplorerUrls: ['https://testnet.arcscan.app'],
        }],
      });
    } else {
      throw err;
    }
  }
};

// Convert a decoded on-chain Trade event into a feed row.
const tradeEventToFeedItem = (
  event: TradeEvent,
  myAddress: string,
  myProfileInfo: { name: string; handle: string; avatar: string },
): Trade => {
  const traderIsMe = event.trader.toLowerCase() === myAddress.toLowerCase();
  const subjectIsMe = event.subject.toLowerCase() === myAddress.toLowerCase();
  return {
    id: event.txHash ?? `${event.subject}-${event.blockNumber ?? 0}-${event.trader}`,
    buyer: traderIsMe ? myProfileInfo.name : formatAddress(event.trader),
    buyerAvatar: traderIsMe ? myProfileInfo.avatar : avatarFor(event.trader),
    subject: subjectIsMe ? myProfileInfo.name : formatAddress(event.subject),
    subjectAvatar: subjectIsMe ? myProfileInfo.avatar : avatarFor(event.subject),
    action: event.isBuy ? 'bought' : 'sold',
    amount: Number(event.amount),
    // grossPrice is 18-decimal native USDC wei.
    price: `${Number(ethers.formatEther(event.grossPrice)).toFixed(4)} USDC`,
    time: 'On-chain',
  };
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'chats' | 'profile'>('home');
  const [homeSubTab, setHomeSubTab] = useState<'global' | 'following'>('global');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBalance, setWalletBalance] = useState('0.00');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isTrading, setIsTrading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [holdings, setHoldings] = useState<UserProfile[]>([]);
  const [trades, setTrades] = useState<Trade[]>(MOCK_TRADES);
  const [exploreUsers, setExploreUsers] = useState<UserProfile[]>(MOCK_EXPLORE);
  const [realHolders, setRealHolders] = useState<Holder[]>([]);
  const [myProfile, setMyProfile] = useState({
    name: 'Anonymous User',
    handle: '@anon',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=arcFIUser',
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [selectedChat, setSelectedChat] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileTab, setProfileTab] = useState<'holding' | 'holders' | 'watchlist'>('holding');
  const [showBridge, setShowBridge] = useState(false);
  const [claimable, setClaimable] = useState('0');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!isLoggedIn || !walletAddress || !ethereum) return;

    const fetchBalance = async () => {
      try {
        const provider = new ethers.BrowserProvider(ethereum);
        const balance = await provider.getBalance(walletAddress);
        setWalletBalance(Number.parseFloat(ethers.formatEther(balance)).toFixed(4));
      } catch (error) {
        console.error('Error fetching balance:', error);
      }
    };

    const fetchRealTrades = async () => {
      try {
        const response = await fetch(`https://testnet.arcscan.app/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc`);
        const data = (await response.json()) as ArcScanResponse;
        const allTxs = data.status === '1' && Array.isArray(data.result) ? data.result : [];

        if (allTxs.length === 0) return;

        const realTrades: Trade[] = allTxs.map((tx, index) => {
          const isOutgoing = tx.from.toLowerCase() === walletAddress.toLowerCase();
          return {
            id: tx.hash ?? `real-${index}`,
            buyer: isOutgoing ? myProfile.name : formatAddress(tx.from),
            buyerAvatar: isOutgoing ? myProfile.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${tx.from}`,
            subject: isOutgoing ? 'Arc Network' : myProfile.name,
            subjectAvatar: isOutgoing ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc' : myProfile.avatar,
            action: isOutgoing ? 'sent' : 'received',
            amount: Number.parseFloat(ethers.formatEther(tx.value)).toFixed(4),
            price: 'Gas Fee Paid',
            time: 'On-chain',
          };
        });
        // When the contract is deployed, the Trade-event indexer (below) owns the
        // feed. Only fall back to generic ArcScan txns in prototype mode.
        if (!isArcKeysDeployed()) {
          setTrades([...realTrades.slice(0, 10), ...MOCK_TRADES]);
        }

        const incomingHolders: Holder[] = allTxs
          .filter((tx) => tx.to.toLowerCase() === walletAddress.toLowerCase() && tx.from.toLowerCase() !== walletAddress.toLowerCase())
          .map((tx) => ({
            id: tx.from,
            name: formatAddress(tx.from),
            handle: `@${tx.from.substring(2, 8)}`,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${tx.from}`,
            address: tx.from,
          }));

        const newMessages: Record<string, ChatMessage[]> = {};
        allTxs.forEach((tx) => {
          if (!tx.input || tx.input === '0x' || tx.input.length <= 10) return;

          try {
            const decoded = ethers.toUtf8String(tx.input);
            const isOutgoing = tx.from.toLowerCase() === walletAddress.toLowerCase();
            const partner = isOutgoing ? tx.to : tx.from;
            if (!newMessages[partner]) newMessages[partner] = [];
            newMessages[partner].push({
              text: decoded,
              sender: isOutgoing ? 'me' : 'them',
              time: new Date(Number(tx.timeStamp) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
          } catch {
            // Ignore transaction data that is not plain UTF-8 chat text.
          }
        });
        setMessages(newMessages);

        // Holders are derived from real Trade events when the contract is live.
        if (!isArcKeysDeployed()) {
          const uniqueHolders = Array.from(new Map(incomingHolders.map((holder) => [holder.address, holder])).values());
          setRealHolders(uniqueHolders);
        }
      } catch (error) {
        console.error('Error fetching real trades:', error);
      }
    };

    const fetchRealCreators = async () => {
      try {
        const response = await fetch(`https://testnet.arcscan.app/api?module=account&action=txlist&address=${ARC_ZERO_ADDRESS}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc`);
        const data = (await response.json()) as ArcScanResponse;
        const txs = data.status === '1' && Array.isArray(data.result) ? data.result : [];

        if (txs.length === 0) return;

        const activeAddresses = Array.from(new Set(txs.map((tx) => tx.from))).slice(0, 15);
        const realCreators: UserProfile[] = activeAddresses.map((addr, index) => ({
          id: `creator-${index}-${addr}`,
          name: addr.toLowerCase() === walletAddress.toLowerCase() ? myProfile.name : `Creator ${addr.substring(0, 6)}`,
          handle: `@${addr.substring(2, 8)}`,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${addr}`,
          supply: getSupplyFromAddress(addr),
          address: addr,
        }));
        const featured: UserProfile = {
          id: 1,
          name: myProfile.name,
          handle: myProfile.handle,
          avatar: myProfile.avatar,
          supply: 5,
          address: walletAddress,
        };
        // On-chain creators (below) own this list when the contract is deployed.
        if (!isArcKeysDeployed()) {
          setExploreUsers([featured, ...realCreators.filter((creator) => creator.address?.toLowerCase() !== walletAddress.toLowerCase())]);
        }
      } catch (error) {
        console.error('Error fetching real creators:', error);
      }
    };

    fetchBalance();
    fetchRealTrades();
    fetchRealCreators();
  }, [isLoggedIn, walletAddress, myProfile.avatar, myProfile.handle, myProfile.name]);

  // Real-time on-chain indexer: seeds the feed from historical Trade events,
  // subscribes to new ones, and derives holders/holdings from on-chain balances.
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!isLoggedIn || !walletAddress || !ethereum || !isArcKeysDeployed()) return;

    const provider = getArcProvider();
    const me = walletAddress.toLowerCase();
    let cancelled = false;
    let unwatch: () => void = () => {};

    const loadIndexer = async () => {
      try {
        const history = await getTradeHistory(provider);
        if (cancelled) return;

        // Newest first for the feed.
        const ordered = [...history].sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
        const feed = ordered.map((event) => tradeEventToFeedItem(event, walletAddress, myProfile));
        setTrades(feed.length > 0 ? [...feed, ...MOCK_TRADES] : MOCK_TRADES);

        // Holders of MY keys: unique buyers of my subject, confirmed via balanceOf.
        const holderCandidates = Array.from(new Set(
          history
            .filter((e) => e.subject.toLowerCase() === me && e.trader.toLowerCase() !== me)
            .map((e) => e.trader),
        ));
        const confirmedHolders: Holder[] = [];
        for (const addr of holderCandidates) {
          try {
            if ((await keyBalanceOf(provider, walletAddress, addr)) > 0n) {
              confirmedHolders.push({
                id: addr,
                name: formatAddress(addr),
                handle: `@${addr.substring(2, 8)}`,
                avatar: avatarFor(addr),
                address: addr,
              });
            }
          } catch {
            // ignore unreadable balance
          }
        }
        if (!cancelled) setRealHolders(confirmedHolders);

        // MY holdings: subjects I hold keys of, one entry per key (confirmed on-chain).
        const subjectCandidates = Array.from(new Set(
          history.filter((e) => e.trader.toLowerCase() === me).map((e) => e.subject),
        ));
        const derivedHoldings: UserProfile[] = [];
        for (const subject of subjectCandidates) {
          try {
            const balance = Number(await keyBalanceOf(provider, subject, walletAddress));
            if (balance <= 0) continue;
            const supply = Number(await totalSupplyOf(provider, subject));
            for (let i = 0; i < balance; i++) {
              derivedHoldings.push({
                id: subject,
                name: subject.toLowerCase() === me ? myProfile.name : `Creator ${subject.substring(0, 6)}`,
                handle: `@${subject.substring(2, 8)}`,
                avatar: avatarFor(subject),
                supply,
                address: subject,
              });
            }
          } catch {
            // ignore unreadable subject
          }
        }
        if (!cancelled) setHoldings(derivedHoldings);

        // Real creators from on-chain ProfileUpdated events (real names/avatars).
        const creators = await getCreators(provider);
        if (!cancelled && creators.length > 0) {
          const users: UserProfile[] = creators.map((creator) => {
            const isMe = creator.address.toLowerCase() === me;
            return {
              id: creator.address,
              name: isMe ? myProfile.name : (creator.name || `Creator ${creator.address.substring(0, 6)}`),
              handle: isMe ? myProfile.handle : (creator.handle || `@${creator.address.substring(2, 8)}`),
              avatar: isMe ? myProfile.avatar : safeAvatar(creator.avatar, creator.address),
              supply: creator.supply,
              address: creator.address,
            };
          });
          setExploreUsers(users);
        }
      } catch (error) {
        console.error('Trade indexer failed to load history:', error);
      }
    };

    void loadIndexer();

    // Live: prepend each new Trade to the feed the moment it is mined.
    unwatch = watchTrades(provider, (event) => {
      if (cancelled) return;
      setTrades((current) => [tradeEventToFeedItem(event, walletAddress, myProfile), ...current]);
    });

    return () => {
      cancelled = true;
      unwatch();
    };
  }, [isLoggedIn, walletAddress, myProfile]);

  // Load the on-chain profile (name/handle/avatar) so it follows the wallet
  // across browsers/devices. Depends only on login + address (not myProfile) to
  // avoid a re-render loop.
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!isLoggedIn || !walletAddress || !ethereum || !isArcKeysDeployed()) return;
    let cancelled = false;
    (async () => {
      try {
        const provider = getArcProvider();
        const [p, pending] = await Promise.all([
          getProfile(provider, walletAddress),
          pendingWithdrawalOf(provider, walletAddress),
        ]);
        if (cancelled) return;
        setClaimable(ethers.formatEther(pending));
        if (p.exists) {
          setMyProfile((prev) => ({
            name: p.name || prev.name,
            handle: p.handle || prev.handle,
            avatar: isSafeAvatar(p.avatarURI) ? p.avatarURI : prev.avatar,
          }));
        }
      } catch (error) {
        console.error('Failed to load on-chain profile:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, walletAddress]);

  const refreshBalance = async (provider: ethers.BrowserProvider) => {
    const newBalance = await provider.getBalance(walletAddress);
    setWalletBalance(Number.parseFloat(ethers.formatEther(newBalance)).toFixed(4));
  };

  const handleTrade = async () => {
    const ethereum = window.ethereum;
    if (!selectedUser || !ethereum) return;

    setIsTrading(true);
    try {
      await ensureArcNetwork(ethereum);
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      // Precise gas/balance check: the CONNECTED wallet must hold USDC on Arc
      // (gas is paid in USDC — even a free key needs gas). Names in Explore come
      // from ArcScan and show regardless of which wallet is connected, so it's
      // easy to be on a wallet that was never funded on Arc.
      const arcBalance = await provider.getBalance(walletAddress);
      if (arcBalance === 0n) {
        setToastMessage(`Wallet ${formatAddress(walletAddress)} has 0 USDC on Arc. Fund THIS address at faucet.circle.com (pick Arc), then retry.`);
        setTimeout(() => setToastMessage(''), 7000);
        return;
      }

      const currentPrice = getPrice(selectedUser.supply);
      const hasRealSubject = !!selectedUser.address && ethers.isAddress(selectedUser.address);
      const useContract = isArcKeysDeployed() && hasRealSubject;

      let tx: ethers.TransactionResponse;
      if (useContract) {
        // Real on-chain purchase: ArcKeys.buyKeys(subject, 1) with the exact quoted value.
        tx = await buyKeys(signer, selectedUser.address as string, 1n);
      } else {
        // Prototype fallback (pre-deploy demo): plain native value transfer.
        const totalAmount = currentPrice * 1.1;
        const recipient = hasRealSubject ? (selectedUser.address as string) : walletAddress;
        tx = await signer.sendTransaction({
          to: recipient,
          value: ethers.parseEther(totalAmount.toString()),
        });
      }

      setToastMessage('Transaction submitted. Waiting for block confirmation...');
      await tx.wait();

      // Reflect the real on-chain supply when possible, otherwise optimistic +1.
      let updatedSupply = selectedUser.supply + 1;
      if (useContract && selectedUser.address) {
        try {
          updatedSupply = Number(await totalSupplyOf(provider, selectedUser.address));
        } catch {
          // keep optimistic value
        }
      }

      setExploreUsers((currentUsers) => currentUsers.map((user) => (
        user.id === selectedUser.id ? { ...user, supply: updatedSupply } : user
      )));
      setHoldings((currentHoldings) => [...currentHoldings, selectedUser]);
      setTrades((currentTrades) => [
        {
          id: tx.hash,
          buyer: myProfile.name,
          buyerAvatar: myProfile.avatar,
          subject: selectedUser.name,
          subjectAvatar: selectedUser.avatar,
          action: 'bought',
          amount: 1,
          price: `${currentPrice.toFixed(4)} ARC`,
          time: 'Just now',
        },
        ...currentTrades,
      ]);
      setSelectedUser(null);
      await refreshBalance(provider);
      setToastMessage(`Successfully bought 1 ARCKEY of ${selectedUser.name} on-chain!`);
      setTimeout(() => setToastMessage(''), 4000);
    } catch (error) {
      console.error('Trade rejected:', error);
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string | number }).code : undefined;
      const reason = (error as { shortMessage?: string; reason?: string })?.shortMessage
        || (error as { reason?: string })?.reason || '';
      const raw = `${reason} ${String((error as { message?: string })?.message ?? '')}`.toLowerCase();
      const lowBalance = /insufficient|missing revert|funds|exceeds balance/.test(raw);
      setToastMessage(
        code === 'ACTION_REJECTED' || code === 4001
          ? 'Transaction rejected by user.'
          : lowBalance
            ? 'Buy failed — likely not enough USDC. Top up on Arc at faucet.circle.com and retry.'
            : reason
              ? `Buy failed: ${reason}`
              : 'Buy failed. Make sure you are on Arc Testnet with enough USDC.',
      );
      setTimeout(() => setToastMessage(''), 6000);
    } finally {
      setIsTrading(false);
    }
  };

  const handleSell = async (userToSell: UserProfile) => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    setIsTrading(true);
    try {
      await ensureArcNetwork(ethereum);
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const currentPrice = getPrice(Math.max(userToSell.supply - 1, 0));
      const hasRealSubject = !!userToSell.address && ethers.isAddress(userToSell.address);
      const useContract = isArcKeysDeployed() && hasRealSubject;

      let tx: ethers.TransactionResponse;
      if (useContract) {
        // Real on-chain sale: ArcKeys.sellKeys(subject, 1). Reverts if you hold none.
        tx = await sellKeys(signer, userToSell.address as string, 1n);
      } else {
        // Prototype fallback (pre-deploy demo): tiny self-transfer to simulate settlement.
        tx = await signer.sendTransaction({
          to: walletAddress,
          value: ethers.parseEther('0.0001'),
        });
      }

      setToastMessage('Processing sell on-chain...');
      await tx.wait();

      setHoldings((currentHoldings) => {
        const index = currentHoldings.findIndex((holding) => holding.id === userToSell.id);
        if (index === -1) return currentHoldings;
        return currentHoldings.filter((_, holdingIndex) => holdingIndex !== index);
      });
      setExploreUsers((currentUsers) => currentUsers.map((user) => (
        user.id === userToSell.id ? { ...user, supply: Math.max(user.supply - 1, 0) } : user
      )));
      setTrades((currentTrades) => [
        {
          id: tx.hash,
          buyer: myProfile.name,
          buyerAvatar: myProfile.avatar,
          subject: userToSell.name,
          subjectAvatar: userToSell.avatar,
          action: 'sold',
          amount: 1,
          price: `${currentPrice.toFixed(4)} ARC`,
          time: 'Just now',
        },
        ...currentTrades,
      ]);
      await refreshBalance(provider);
      setToastMessage(`Successfully sold 1 ARCKEY of ${userToSell.name}!`);
      setTimeout(() => setToastMessage(''), 4000);
    } catch (error) {
      console.error(error);
      setToastMessage('Sell transaction failed.');
      setTimeout(() => setToastMessage(''), 4000);
    } finally {
      setIsTrading(false);
    }
  };

  const saveProfile = async () => {
    const name = editName.trim();
    const handle = editHandle.trim();
    const ethereum = window.ethereum;

    // Persist on-chain so the profile follows the wallet on any browser/device.
    if (isArcKeysDeployed() && ethereum) {
      try {
        setToastMessage('Saving profile on-chain — confirm in your wallet…');
        await ensureArcNetwork(ethereum);
        const provider = new ethers.BrowserProvider(ethereum);
        const signer = await provider.getSigner();
        const tx = await updateProfile(signer, name, handle, myProfile.avatar);
        await tx.wait();
        setMyProfile({ name, handle, avatar: myProfile.avatar });
        setIsEditModalOpen(false);
        setToastMessage('Profile saved on-chain!');
      } catch (error) {
        console.error(error);
        setToastMessage('Failed to save profile on-chain.');
      } finally {
        setTimeout(() => setToastMessage(''), 3000);
      }
      return;
    }

    // Fallback (contract not deployed): local only.
    setMyProfile({ ...myProfile, name, handle });
    setIsEditModalOpen(false);
    setToastMessage('Profile updated (local only — deploy the contract to persist).');
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleWithdraw = async () => {
    const ethereum = window.ethereum;
    if (!ethereum) return;
    setClaiming(true);
    try {
      setToastMessage('Claiming fees — confirm in your wallet…');
      await ensureArcNetwork(ethereum);
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const tx = await withdraw(signer);
      await tx.wait();
      setClaimable('0');
      await refreshBalance(provider);
      setToastMessage('Fees claimed!');
    } catch (error) {
      console.error(error);
      setToastMessage('Nothing to claim, or the claim failed.');
    } finally {
      setClaiming(false);
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  const sendMessageOnChain = async () => {
    const ethereum = window.ethereum;
    if (!selectedChat || !newMessage.trim() || !walletAddress || !ethereum) return;

    if (!selectedChat.address || !ethers.isAddress(selectedChat.address)) {
      setToastMessage('This chat does not have a real wallet address yet.');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    setIsSendingMsg(true);
    try {
      await ensureArcNetwork(ethereum);
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      let tx: ethers.TransactionResponse;
      if (isArcKeysDeployed()) {
        // Holder-gated on-chain message: ArcKeys.sendMessage(subject, text).
        // Reverts unless the sender holds a key of this subject (or is the subject).
        tx = await sendKeyMessage(signer, selectedChat.address, newMessage);
      } else {
        // Prototype fallback (pre-deploy demo): raw UTF-8 calldata transfer.
        const hexData = ethers.hexlify(ethers.toUtf8Bytes(newMessage));
        tx = await signer.sendTransaction({
          to: selectedChat.address,
          value: 0,
          data: hexData,
        });
      }

      setToastMessage('Sending message to blockchain...');
      await tx.wait();

      const messageText = newMessage;
      const key = selectedChat.address;
      setMessages((currentMessages) => ({
        ...currentMessages,
        [key]: [...(currentMessages[key] ?? []), { text: messageText, sender: 'me', time: 'Just now' }],
      }));
      setNewMessage('');
      setToastMessage('Message confirmed on-chain!');
      setTimeout(() => setToastMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setToastMessage('Failed to send message.');
      setTimeout(() => setToastMessage(''), 3000);
    } finally {
      setIsSendingMsg(false);
    }
  };

  if (!isLoggedIn) {
    return <LandingPage onLogin={(address) => {
      setWalletAddress(address);
      setIsLoggedIn(true);
    }} />;
  }

  const groupedHoldings = Object.values(
    holdings.reduce<Record<string, UserProfile & { count: number }>>((acc, user) => {
      const key = String(user.id);
      if (!acc[key]) acc[key] = { ...user, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}),
  );

  const renderChatContent = () => {
    if (selectedChat) {
      const chatKey = selectedChat.address ?? String(selectedChat.id);
      const chatMessages = messages[chatKey] ?? [];

      return (
        <div className="chat-detail-container">
          <div className="header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSelectedChat(null)} style={{ background: 'none', border: 'none', color: 'var(--ft-text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <X size={20} />
            </button>
            <img src={selectedChat.avatar} style={{ width: '32px', height: '32px', borderRadius: '50%' }} alt="" />
            <div>
              <div style={{ fontWeight: 600 }}>{selectedChat.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--ft-accent)' }}>On-chain Chat</div>
            </div>
          </div>
          <div className="chat-messages" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ft-text-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              End-to-End On-Chain Messaging via Arc Network
            </div>
            {chatMessages.map((msg, i) => (
              <div key={`${msg.time}-${i}`} style={{
                alignSelf: msg.sender === 'me' ? 'flex-end' : 'flex-start',
                background: msg.sender === 'me' ? 'var(--ft-accent)' : 'rgba(255,255,255,0.05)',
                color: msg.sender === 'me' ? '#000' : 'var(--ft-text)',
                padding: '8px 16px',
                borderRadius: '16px',
                maxWidth: '80%',
                position: 'relative',
              }}>
                <div style={{ fontWeight: 500 }}>{msg.text}</div>
                <div style={{ fontSize: '9px', opacity: 0.6, textAlign: 'right', marginTop: '4px' }}>{msg.time}</div>
              </div>
            ))}
          </div>
          <div className="chat-input-area" style={{ padding: '16px', borderTop: '1px solid var(--ft-border)', display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Send on-chain message..."
              value={newMessage}
              disabled={isSendingMsg}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendMessageOnChain();
              }}
            />
            <button
              className="buy-button-small"
              disabled={isSendingMsg}
              style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }}
              onClick={() => void sendMessageOnChain()}
            >
              {isSendingMsg ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="header">
          <h2>Messages</h2>
        </div>
        <div className="feed-container">
          {groupedHoldings.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ft-text-dim)' }}>
              <MessageCircle size={48} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
              <h3>Your Chatrooms</h3>
              <p style={{ marginTop: '8px' }}>Buy an ARCKEY to join exclusive holder-only chats.</p>
            </div>
          ) : (
            groupedHoldings.map((user) => (
              <div key={user.id} className="user-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedChat(user)}>
                <img className="avatar-main" src={user.avatar} alt={user.name} />
                <div className="user-details">
                  <div className="user-name">{user.name}</div>
                  <div className="user-handle">{user.address ? 'On-chain chat available' : 'Buy a real creator key to message on-chain'}</div>
                </div>
                <div style={{ color: 'var(--ft-accent)', fontSize: '12px' }}>{user.count} Key{user.count > 1 ? 's' : ''}</div>
              </div>
            ))
          )}
        </div>
      </>
    );
  };

  const renderMainContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <>
            <div className="header">
              <h2>Home</h2>
            </div>
            <div className="tabs-container">
              <div className={`tab ${homeSubTab === 'global' ? 'active' : ''}`} onClick={() => setHomeSubTab('global')}>
                Global
              </div>
              <div className={`tab ${homeSubTab === 'following' ? 'active' : ''}`} onClick={() => setHomeSubTab('following')}>
                Following
              </div>
            </div>
            <div className="feed-container">
              {trades.filter((trade) => {
                if (homeSubTab === 'global') return true;
                return holdings.some((holding) => holding.name === trade.subject);
              }).map((trade) => {
                const isMe = trade.buyer === 'Sandi' || trade.buyer === myProfile.name;
                const buyerName = isMe ? myProfile.name : trade.buyer;
                const buyerAvatar = isMe ? myProfile.avatar : trade.buyerAvatar;
                const actionMeta = getTradeActionMeta(trade.action);

                return (
                  <div key={trade.id} className="trade-item">
                    <div className="avatars-container">
                      <img className="avatar-main" src={trade.subjectAvatar} alt={trade.subject} />
                      <img className="avatar-sub" src={buyerAvatar} alt={buyerName} />
                    </div>
                    <div className="trade-content">
                      <div className="trade-text">
                        <strong>{buyerName}</strong> {trade.action} {trade.amount} share of <strong>{trade.subject}</strong>
                      </div>
                      <div className="trade-meta">
                        <span className={actionMeta.className}>{actionMeta.label}</span>
                        <span>-</span>
                        <span>{trade.price}</span>
                        <span>-</span>
                        <span>{trade.time}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      case 'explore':
        return (
          <>
            <div className="header">
              <h2>Explore</h2>
            </div>
            <div className="feed-container">
              {exploreUsers.filter((user) => (
                user.name.toLowerCase().includes(searchQuery.toLowerCase())
                || user.handle.toLowerCase().includes(searchQuery.toLowerCase())
              )).map((user) => {
                const isMe = user.id === 1;
                const displayUser = isMe ? { ...user, name: myProfile.name, handle: myProfile.handle, avatar: myProfile.avatar } : user;
                const price = getPrice(displayUser.supply);

                return (
                  <div key={user.id} className="user-row">
                    <img className="avatar-main" src={displayUser.avatar} alt={displayUser.name} />
                    <div className="user-details">
                      <div className="user-name">{displayUser.name}</div>
                      <div className="user-handle">{displayUser.handle}</div>
                    </div>
                    <div className="user-price">{price.toFixed(4)} ARC</div>
                    <button className="buy-button-small" onClick={() => setSelectedUser(displayUser)}>Buy</button>
                  </div>
                );
              })}
            </div>
          </>
        );
      case 'chats':
        return renderChatContent();
      case 'profile':
        return (
          <>
            <div className="header">
              <h2>Profile</h2>
              <Settings size={20} color="var(--ft-text-dim)" style={{ cursor: 'pointer' }} />
            </div>
            <div className="feed-container">
              <div className="my-profile-header">
                <img className="my-profile-avatar" src={myProfile.avatar} alt="My Avatar" />
                <div className="my-profile-info">
                  <div className="my-profile-name">{myProfile.name}</div>
                  <div className="my-profile-handle">{myProfile.handle}</div>
                </div>
                <button
                  className="edit-profile-btn"
                  onClick={() => {
                    setEditName(myProfile.name);
                    setEditHandle(myProfile.handle);
                    setIsEditModalOpen(true);
                  }}
                >
                  Edit Profile
                </button>
              </div>

              <div className="portfolio-header">
                <div className="portfolio-value">{walletBalance} ARC</div>
                <div className="portfolio-label">Wallet Balance</div>
                <button
                  className="buy-button-small"
                  style={{ marginTop: 12 }}
                  onClick={() => setShowBridge(true)}
                >
                  Bridge USDC to Arc
                </button>
                {Number(claimable) > 0 && (
                  <button
                    className="buy-button-small"
                    style={{ marginTop: 12, marginLeft: 8, backgroundColor: 'var(--ft-accent)', color: '#00131a' }}
                    disabled={claiming}
                    onClick={() => void handleWithdraw()}
                  >
                    {claiming ? 'Claiming…' : `Claim ${Number(claimable).toFixed(4)} USDC`}
                  </button>
                )}
              </div>
              <div className="tabs-container">
                <div className={`tab ${profileTab === 'holding' ? 'active' : ''}`} onClick={() => setProfileTab('holding')}>Holding</div>
                <div className={`tab ${profileTab === 'holders' ? 'active' : ''}`} onClick={() => setProfileTab('holders')}>Holders</div>
                <div className={`tab ${profileTab === 'watchlist' ? 'active' : ''}`} onClick={() => setProfileTab('watchlist')}>Watchlist</div>
              </div>

              {profileTab === 'holding' && (
                groupedHoldings.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ft-text-dim)' }}>
                    You don't own any ARCKEYS yet.
                  </div>
                ) : (
                  groupedHoldings.map((user) => (
                    <div key={user.id} className="user-row">
                      <img className="avatar-main" src={user.avatar} alt={user.name} />
                      <div className="user-details">
                        <div className="user-name">{user.name}</div>
                        <div className="user-handle">{user.handle} - {user.count} owned</div>
                      </div>
                      <div className="user-price">{getPrice(Math.max(user.supply - 1, 0)).toFixed(4)} ARC</div>
                      <button
                        className="buy-button-small"
                        style={{ backgroundColor: 'var(--ft-danger)', color: 'white', border: 'none', boxShadow: 'none' }}
                        onClick={() => void handleSell(user)}
                      >
                        Sell
                      </button>
                    </div>
                  ))
                )
              )}

              {profileTab === 'holders' && (
                <div className="holders-list">
                  {realHolders.length === 0 ? (
                    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ft-text-dim)' }}>
                      No real holders found for your address on-chain yet.
                    </div>
                  ) : (
                    realHolders.map((holder) => (
                      <div key={holder.id} className="user-row">
                        <img className="avatar-main" src={holder.avatar} alt={holder.name} />
                        <div className="user-details">
                          <div className="user-name">{holder.name}</div>
                          <div className="user-handle">{holder.handle}</div>
                        </div>
                        <div className="user-price">1 Interaction</div>
                      </div>
                    ))
                  )}
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ft-text-dim)', fontSize: '13px' }}>
                    These are real wallet addresses that have interacted with you on the Arc Network.
                  </div>
                </div>
              )}

              {profileTab === 'watchlist' && (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ft-text-dim)' }}>
                  Your watchlist is empty.
                </div>
              )}
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="desktop-layout">
      <div className="sidebar">
        <div className="brand-logo">
          <div className="logo-icon">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 5C25.147 5 5 25.147 5 50V95H35V50C35 41.716 41.716 35 50 35C58.284 35 65 41.716 65 50V70H50V95H95V50C95 25.147 74.853 5 50 5Z" fill="var(--ft-accent)" />
            </svg>
          </div>
          arcFI
        </div>

        <div className="nav-links">
          <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <Home /> Home
          </button>
          <button className={`nav-item ${activeTab === 'explore' ? 'active' : ''}`} onClick={() => setActiveTab('explore')}>
            <Search /> Explore
          </button>
          <button className={`nav-item ${activeTab === 'chats' ? 'active' : ''}`} onClick={() => setActiveTab('chats')}>
            <MessageCircle /> Chats
          </button>
          <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <User /> Profile
          </button>
        </div>

        <button className="connect-wallet-btn" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--ft-text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => setIsLoggedIn(false)}>
          <LogOut size={18} />
          {formatAddress(walletAddress)}
        </button>
      </div>

      <div className="main-content">
        {renderMainContent()}
      </div>

      <div className="right-sidebar">
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search users or ARCKEYS"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="trending-card">
          <div className="trending-header">Trending ARCKEYS</div>
          {exploreUsers.slice(1, 4).map((user) => {
            const price = getPrice(user.supply);

            return (
              <div key={user.id} className="user-row">
                <img className="avatar-main" style={{ width: '40px', height: '40px' }} src={user.avatar} alt={user.name} />
                <div className="user-details">
                  <div className="user-name" style={{ fontSize: '15px' }}>{user.name}</div>
                  <div className="user-handle">{user.handle}</div>
                  <div style={{ fontSize: '10px', color: 'var(--ft-accent)' }}>{price.toFixed(4)} ARC</div>
                </div>
                <button className="buy-button-small" onClick={() => setSelectedUser(user)}>Buy</button>
              </div>
            );
          })}
        </div>
      </div>

      <nav className="bottom-nav">
        <button className={`nav-item-mobile ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <Home />
        </button>
        <button className={`nav-item-mobile ${activeTab === 'explore' ? 'active' : ''}`} onClick={() => setActiveTab('explore')}>
          <Search />
        </button>
        <button className={`nav-item-mobile ${activeTab === 'chats' ? 'active' : ''}`} onClick={() => setActiveTab('chats')}>
          <MessageCircle />
        </button>
        <button className={`nav-item-mobile ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <User />
        </button>
      </nav>

      {isEditModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Profile</h3>
              <button className="close-btn" onClick={() => setIsEditModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
              <div className="input-group" style={{ width: '100%', marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--ft-text-dim)' }}>Name</label>
                <input
                  type="text"
                  className="search-input"
                  style={{ width: '100%', padding: '12px 16px' }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="input-group" style={{ width: '100%', marginBottom: '32px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--ft-text-dim)' }}>Handle</label>
                <input
                  type="text"
                  className="search-input"
                  style={{ width: '100%', padding: '12px 16px' }}
                  value={editHandle}
                  onChange={(e) => setEditHandle(e.target.value)}
                />
              </div>

              <button
                className="confirm-btn"
                onClick={() => void saveProfile()}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <div className="modal-overlay" onClick={() => !isTrading && setSelectedUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Buy ARCKEY</h3>
              <button className="close-btn" onClick={() => !isTrading && setSelectedUser(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <img src={selectedUser.avatar} alt={selectedUser.name} />
              <h2>{selectedUser.name}</h2>
              <div className="handle">{selectedUser.handle}</div>

              <div className="trade-details">
                <div className="trade-row">
                  <span>Price</span>
                  <span>{getPrice(selectedUser.supply).toFixed(4)} ARC</span>
                </div>
                <div className="trade-row">
                  <span>Fee (10%)</span>
                  <span>{(getPrice(selectedUser.supply) * 0.1).toFixed(4)} ARC</span>
                </div>
                <div className="trade-row">
                  <span>Total</span>
                  <span>{(getPrice(selectedUser.supply) * 1.1).toFixed(4)} ARC</span>
                </div>
              </div>

              <button
                className="confirm-btn"
                disabled={isTrading}
                onClick={() => void handleTrade()}
              >
                {isTrading ? 'Awaiting Approval...' : 'Confirm Trade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBridge && <BridgePanel onClose={() => setShowBridge(false)} />}

      {toastMessage && (
        <div className="toast-container">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
