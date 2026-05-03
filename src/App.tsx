import { useState, useEffect } from 'react';
import { Home, Search, MessageCircle, User, Settings, X, LogOut } from 'lucide-react';
import { ethers } from 'ethers';
import LandingPage from './LandingPage';
import './index.css';

interface UserProfile {
  id: number;
  name: string;
  handle: string;
  avatar: string;
  supply: number;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

const MOCK_TRADES = [
  { id: 1, buyer: 'Sandi', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sandi', subject: 'Arc Network', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc', action: 'bought', amount: 1, price: '0.05 ARC', time: '2m ago' },
  { id: 2, buyer: 'Alice', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice', subject: 'Bob', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob', action: 'sold', amount: 1, price: '0.12 ARC', time: '5m ago' },
  { id: 3, buyer: 'Charlie', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie', subject: 'Sandi', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sandi', action: 'bought', amount: 2, price: '0.80 ARC', time: '15m ago' },
  { id: 4, buyer: 'Arc Builder', buyerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc', subject: 'Alice', subjectAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice', action: 'bought', amount: 5, price: '2.50 ARC', time: '1h ago' }
];

const MOCK_EXPLORE: UserProfile[] = [
  { id: 1, name: 'Sandi', handle: '@sandi_dev', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sandi', supply: 5 },
  { id: 2, name: 'Arc Builder', handle: '@arc_network', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc', supply: 12 },
  { id: 3, name: 'Alice', handle: '@alice_web3', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice', supply: 8 },
];

const getPrice = (supply: number) => {
  if (supply <= 0) return 0;
  // Bonding curve: (S^2 / 100) ARC
  return (supply * supply) / 100;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [homeSubTab, setHomeSubTab] = useState('global');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [walletBalance, setWalletBalance] = useState<string>('0.00');
  
  // Trading State
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_EXPLORE[0] | null>(null);
  const [isTrading, setIsTrading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [holdings, setHoldings] = useState<any[]>([]);
  const [trades, setTrades] = useState(MOCK_TRADES);
  const [exploreUsers, setExploreUsers] = useState(MOCK_EXPLORE);
  const [realHolders, setRealHolders] = useState<{id: string, name: string, handle: string, avatar: string}[]>([]);
  
  // My Profile State
  const [myProfile, setMyProfile] = useState({
    name: 'Anonymous User',
    handle: '@anon',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=arcFIUser`
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  
  // Chat State
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<Record<string, { text: string, sender: 'me' | 'them', time: string }[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [profileTab, setProfileTab] = useState<'holding' | 'holders' | 'watchlist'>('holding');

  useEffect(() => {
    if (isLoggedIn && walletAddress && typeof window.ethereum !== 'undefined') {
      const fetchBalance = async () => {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const balance = await provider.getBalance(walletAddress);
          setWalletBalance(parseFloat(ethers.formatEther(balance)).toFixed(4));
        } catch (error) {
          console.error("Error fetching balance:", error);
        }
      };

      const fetchRealTrades = async () => {
        try {
          const response = await fetch(`https://testnet.arcscan.app/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc`);
          const data = await response.json();
          
          if (data.status === '1' && data.result.length > 0) {
            const allTxs = data.result;
            const realTrades = allTxs.map((tx: any, index: number) => {
              const isOutgoing = tx.from.toLowerCase() === walletAddress.toLowerCase();
              return {
                id: `real-${index}`,
                buyer: isOutgoing ? myProfile.name : formatAddress(tx.from),
                buyerAvatar: isOutgoing ? myProfile.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${tx.from}`,
                subject: isOutgoing ? 'Arc Network' : myProfile.name,
                subjectAvatar: isOutgoing ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arc' : myProfile.avatar,
                action: isOutgoing ? 'sent' : 'received',
                amount: parseFloat(ethers.formatEther(tx.value)).toFixed(4),
                price: 'Gas Fee Paid',
                time: 'On-chain'
              };
            });
            setTrades([...realTrades.slice(0, 10), ...MOCK_TRADES]);

            const incomingHolders = allTxs
              .filter((tx: any) => tx.to.toLowerCase() === walletAddress.toLowerCase() && tx.from.toLowerCase() !== walletAddress.toLowerCase())
              .map((tx: any) => ({
                id: tx.from,
                name: formatAddress(tx.from),
                handle: `@${tx.from.substring(0, 8)}`,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${tx.from}`,
                address: tx.from
              }));
            
            const newMessages: Record<string, any[]> = {};
            allTxs.forEach((tx: any) => {
              if (tx.input && tx.input !== '0x' && tx.input.length > 10) {
                try {
                  const decoded = ethers.toUtf8String(tx.input);
                  const isOutgoing = tx.from.toLowerCase() === walletAddress.toLowerCase();
                  const partner = isOutgoing ? tx.to : tx.from;
                  if (!newMessages[partner]) newMessages[partner] = [];
                  newMessages[partner].push({
                    text: decoded,
                    sender: isOutgoing ? 'me' : 'them',
                    time: new Date(tx.timeStamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  });
                } catch (e) {}
              }
            });
            setMessages(newMessages);
            const uniqueHolders = Array.from(new Map(incomingHolders.map((item: any) => [item.name, item])).values());
            setRealHolders(uniqueHolders as any);
          }
        } catch (error) {
          console.error("Error fetching real trades:", error);
        }
      };

      const fetchRealCreators = async () => {
        try {
          const response = await fetch(`https://testnet.arcscan.app/api?module=account&action=txlist&address=0x0000000000000000000000000000000000000000&startblock=0&endblock=99999999&page=1&offset=20&sort=desc`);
          const data = await response.json();
          if (data.status === '1' && data.result.length > 0) {
            const activeAddresses = Array.from(new Set(data.result.map((tx: any) => tx.from))).slice(0, 15);
            const realCreators = activeAddresses.map((addr: any, index: number) => ({
              id: index + 10,
              name: addr.toLowerCase() === walletAddress.toLowerCase() ? myProfile.name : `Creator ${addr.substring(0, 6)}`,
              handle: `@${addr.substring(2, 8)}`,
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${addr}`,
              supply: Math.floor(Math.random() * 15) + 5,
              address: addr
            }));
            const featured = {
              id: 1,
              name: myProfile.name,
              handle: myProfile.handle,
              avatar: myProfile.avatar,
              supply: 5,
              address: walletAddress
            };
            setExploreUsers([featured, ...realCreators.filter(c => c.address.toLowerCase() !== walletAddress.toLowerCase())]);
          }
        } catch (error) {
          console.error("Error fetching real creators:", error);
        }
      };

      fetchBalance();
      fetchRealTrades();
      fetchRealCreators();
    }
  }, [isLoggedIn, walletAddress, myProfile.name]);

  if (!isLoggedIn) {
    return <LandingPage onLogin={(address) => {
      setWalletAddress(address);
      setIsLoggedIn(true);
    }} />;
  }

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const handleTrade = async () => {
    if (!selectedUser || typeof window.ethereum === 'undefined') return;
    
    setIsTrading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const currentPrice = getPrice(selectedUser.supply);
      const totalAmount = currentPrice * 1.1; // Price + 10% Fee
      
      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(totalAmount.toString()), 
      });
      
      setToastMessage('Transaction submitted. Waiting for block confirmation...');
      
      // Wait for the transaction to be mined (Sub-second finality on Arc!)
      await tx.wait();
      
      // Increment supply for the user
      const updatedExplore = exploreUsers.map(u => 
        u.id === selectedUser.id ? { ...u, supply: u.supply + 1 } : u
      );
      setExploreUsers(updatedExplore);

      const newTrade = {
        id: Date.now(),
        buyer: myProfile.name,
        buyerAvatar: myProfile.avatar,
        subject: selectedUser.name,
        subjectAvatar: selectedUser.avatar,
        action: 'bought',
        amount: 1,
        price: `${currentPrice.toFixed(4)} ARC`,
        time: 'Just now'
      };
      setTrades([newTrade, ...trades]);
      
      setSelectedUser(null);
      
      // Refresh Balance
      const newBalance = await provider.getBalance(walletAddress);
      setWalletBalance(parseFloat(ethers.formatEther(newBalance)).toFixed(4));
      
      setToastMessage(`Successfully bought 1 ARCKEY of ${selectedUser.name} on-chain!`);
      setTimeout(() => setToastMessage(''), 4000);
    } catch (error: any) {
      console.error("Trade rejected:", error);
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        setToastMessage('Transaction rejected by user.');
      } else {
        setToastMessage('Transaction failed. Make sure you have enough ARC for gas.');
      }
      setTimeout(() => setToastMessage(''), 4000);
    } finally {
      setIsTrading(false);
    }
  };

  const handleSell = async (userToSell: any) => {
    setIsTrading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const currentPrice = getPrice(userToSell.supply - 1);
      
      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther("0.0001"), 
      });
      
      setToastMessage('Processing sell on-chain...');
      await tx.wait();
      
      const index = holdings.findIndex(h => h.id === userToSell.id);
      if (index > -1) {
        const newHoldings = [...holdings];
        newHoldings.splice(index, 1);
        setHoldings(newHoldings);
      }
      
      // Decrement supply
      const updatedExplore = exploreUsers.map(u => 
        u.id === userToSell.id ? { ...u, supply: u.supply - 1 } : u
      );
      setExploreUsers(updatedExplore);
      
      const newTrade = {
        id: Date.now(),
        buyer: myProfile.name,
        buyerAvatar: myProfile.avatar,
        subject: userToSell.name,
        subjectAvatar: userToSell.avatar,
        action: 'sold',
        amount: 1,
        price: `${currentPrice.toFixed(4)} ARC`,
        time: 'Just now'
      };
      setTrades([newTrade, ...trades]);
      
      const newBalance = await provider.getBalance(walletAddress);
      setWalletBalance(parseFloat(ethers.formatEther(newBalance)).toFixed(4));
      
      setToastMessage(`Successfully sold 1 ARCKEY of ${userToSell.name}!`);
      setTimeout(() => setToastMessage(''), 4000);
    } catch (error) {
      console.error(error);
      setToastMessage('Sell transaction failed.');
    } finally {
      setIsTrading(false);
    }
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
              {trades.filter((trade: any) => {
                if (homeSubTab === 'global') return true;
                // For Following tab, only show trades where the user owns the subject's key
                return holdings.some(h => h.name === trade.subject);
              }).map((trade: any) => {
                const isMe = trade.buyer === 'Sandi' || trade.buyer === myProfile.name;
                const buyerName = isMe ? myProfile.name : trade.buyer;
                const buyerAvatar = isMe ? myProfile.avatar : trade.buyerAvatar;
                
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
                        <span className={trade.action === 'bought' ? 'buy-action' : 'sell-action'}>
                          {trade.action === 'bought' ? 'Buy' : 'Sell'}
                        </span>
                        <span>•</span>
                        <span>{trade.price}</span>
                        <span>•</span>
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
              {exploreUsers.filter(user => 
                user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                user.handle.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((user) => {
                const isMe = user.id === 1; // Assuming ID 1 is the user 'Sandi'
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
        if (selectedChat) {
          const chatMessages = messages[selectedChat.id] || messages[selectedChat.address] || [];
          
          const sendMessageOnChain = async () => {
            if (!newMessage.trim() || !walletAddress) return;
            setIsSendingMsg(true);
            try {
              const provider = new ethers.BrowserProvider(window.ethereum);
              const signer = await provider.getSigner();
              
              // Recipient address (default to Alice mock if no real address)
              const toAddress = selectedChat.address || "0x0000000000000000000000000000000000000000";
              
              // Encode message as HEX
              const hexData = ethers.hexlify(ethers.toUtf8Bytes(newMessage));
              
              const tx = await signer.sendTransaction({
                to: toAddress,
                value: 0, // 0 ARC transfer
                data: hexData // Our message stored in blockchain!
              });

              setToastMessage('Sending message to blockchain...');
              await tx.wait();
              
              // Update local UI immediately
              const updatedMessages = { ...messages };
              const key = selectedChat.id || selectedChat.address;
              if (!updatedMessages[key]) updatedMessages[key] = [];
              updatedMessages[key].push({ text: newMessage, sender: 'me', time: 'Just now' });
              setMessages(updatedMessages);
              setNewMessage('');
              setToastMessage('Message confirmed on-chain!');
              setTimeout(() => setToastMessage(''), 3000);
            } catch (error) {
              console.error(error);
              setToastMessage('Failed to send message.');
            } finally {
              setIsSendingMsg(false);
            }
          };

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
                  <div key={i} style={{ 
                    alignSelf: msg.sender === 'me' ? 'flex-end' : 'flex-start',
                    background: msg.sender === 'me' ? 'var(--ft-accent)' : 'rgba(255,255,255,0.05)',
                    color: msg.sender === 'me' ? '#000' : 'var(--ft-text)',
                    padding: '8px 16px',
                    borderRadius: '16px',
                    maxWidth: '80%',
                    position: 'relative'
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
                  onKeyPress={(e) => e.key === 'Enter' && sendMessageOnChain()}
                />
                <button 
                  className="buy-button-small" 
                  disabled={isSendingMsg}
                  style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }}
                  onClick={sendMessageOnChain}
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
              {Object.values(
                holdings.reduce((acc: Record<number, any>, user: any) => {
                  if (!acc[user.id]) acc[user.id] = user;
                  return acc;
                }, {})
              ).length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ft-text-dim)' }}>
                  <MessageCircle size={48} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
                  <h3>Your Chatrooms</h3>
                  <p style={{ marginTop: '8px' }}>Buy an ARCKEY to join exclusive holder-only chats.</p>
                </div>
              ) : (
                Object.values(
                  holdings.reduce((acc: Record<number, any>, user: any) => {
                    if (!acc[user.id]) acc[user.id] = user;
                    return acc;
                  }, {})
                ).map((user: any) => (
                  <div key={user.id} className="user-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedChat(user)}>
                    <img className="avatar-main" src={user.avatar} alt={user.name} />
                    <div className="user-details">
                      <div className="user-name">{user.name}</div>
                      <div className="user-handle">Last message: Hey holder!</div>
                    </div>
                    <div style={{ color: 'var(--ft-accent)', fontSize: '12px' }}>Active</div>
                  </div>
                ))
              )}
            </div>
          </>
        );
      case 'profile':
        return (
          <>
            <div className="header">
              <h2>Profile</h2>
              <Settings size={20} color="var(--ft-text-dim)" style={{ cursor: 'pointer' }} />
            </div>
            <div className="feed-container">
              {/* Profile Header section */}
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
              </div>
              <div className="tabs-container">
                <div className={`tab ${profileTab === 'holding' ? 'active' : ''}`} onClick={() => setProfileTab('holding')}>Holding</div>
                <div className={`tab ${profileTab === 'holders' ? 'active' : ''}`} onClick={() => setProfileTab('holders')}>Holders</div>
                <div className={`tab ${profileTab === 'watchlist' ? 'active' : ''}`} onClick={() => setProfileTab('watchlist')}>Watchlist</div>
              </div>
              
              {profileTab === 'holding' && (
                holdings.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ft-text-dim)' }}>
                    You don't own any ARCKEYS yet.
                  </div>
                ) : (
                  // Group holdings by ID
                  Object.values(
                    holdings.reduce((acc: Record<number, any>, user: any) => {
                      if (!acc[user.id]) {
                        acc[user.id] = { ...user, count: 0 };
                      }
                      acc[user.id].count += 1;
                      return acc;
                    }, {})
                  ).map((user: any) => (
                    <div key={user.id} className="user-row">
                      <img className="avatar-main" src={user.avatar} alt={user.name} />
                      <div className="user-details">
                        <div className="user-name">{user.name}</div>
                        <div className="user-handle">{user.handle}</div>
                      </div>
                      <div className="user-price">{getPrice(user.supply - 1).toFixed(4)} ARC</div>
                      <button 
                        className="buy-button-small" 
                        style={{ backgroundColor: 'var(--ft-danger)', color: 'white', border: 'none', boxShadow: 'none' }}
                        onClick={() => handleSell(user)}
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
                    realHolders.map(holder => (
                      <div key={holder.id} className="user-row">
                        <img className="avatar-main" src={holder.avatar} alt={holder.name} />
                        <div className="user-details">
                          <div className="user-name">{holder.name}</div>
                          <div className="user-handle">{holder.handle}</div>
                        </div>
                        <div className="user-price">1 ARCKEY</div>
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
      {/* Left Sidebar */}
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

      {/* Main Content Area */}
      <div className="main-content">
        {renderMainContent()}
      </div>

      {/* Right Sidebar */}
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

      {/* Mobile Bottom Navigation */}
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

      {/* Edit Profile Modal */}
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
                onClick={() => {
                  setMyProfile({ ...myProfile, name: editName, handle: editHandle });
                  setIsEditModalOpen(false);
                  setToastMessage('Profile updated successfully!');
                  setTimeout(() => setToastMessage(''), 3000);
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trade Modal */}
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
                onClick={handleTrade}
              >
                {isTrading ? 'Awaiting Approval...' : 'Confirm Trade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-container">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
