import { useState } from 'react';
import { ethers } from 'ethers';
import { Mail, MessageSquare } from 'lucide-react';
import './LandingPage.css';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

interface LandingPageProps {
  onLogin: (address: string) => void;
}

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932L18.901 1.153ZM17.61 20.644h2.039L6.486 3.24H4.298L17.61 20.644Z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const getErrorMessage = (error: unknown) => (
  typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message)
    : 'Unknown error'
);

const getErrorCode = (error: unknown) => (
  typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
);

const createMockAddress = () => ethers.Wallet.createRandom().address;

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        setIsConnecting(true);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []) as string[];

        if (accounts.length > 0) {
          // Switch to Arc Testnet
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x4CEF52' }], // 5042002 in hex
            });
          } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (getErrorCode(switchError) === 4902) {
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [
                    {
                      chainId: '0x4CEF52',
                      chainName: 'Arc Testnet',
                      rpcUrls: ['https://rpc.testnet.arc.network'],
                      nativeCurrency: {
                        name: 'USDC',
                        symbol: 'USDC',
                        decimals: 18
                      },
                      blockExplorerUrls: ['https://testnet.arcscan.app']
                    }
                  ],
                });
              } catch (addError) {
                console.error("Failed to add Arc Testnet", addError);
                alert(`Gagal menambahkan jaringan Arc Testnet otomatis. Pesan error dari MetaMask: ${getErrorMessage(addError)}`);
                return;
              }
            } else {
              console.error("Failed to switch to Arc Testnet", switchError);
              alert("Please switch to Arc Testnet in your wallet to continue.");
              return;
            }
          }

          onLogin(accounts[0]);
        }
      } catch (error) {
        console.error("User rejected request or error occurred:", error);
        alert("Failed to connect wallet. Please approve the request in your wallet.");
      } finally {
        setIsConnecting(false);
      }
    } else {
      alert("No Web3 wallet detected. Please install MetaMask or another EVM wallet.");
    }
  };
  return (
    <div className="landing-page">
      {/* Decorative Background Elements */}
      <div className="floating-element pos-1" style={{ '--rot': '-5deg' } as React.CSSProperties}>
        <img className="floating-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=A" alt="" />
        <div className="floating-text">
          <div className="name"></div>
          <div className="price"></div>
        </div>
      </div>

      <div className="floating-element pos-2" style={{ '--rot': '10deg' } as React.CSSProperties}>
        <img className="floating-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=B" alt="" />
        <div className="floating-text">
          <div className="name"></div>
          <div className="price"></div>
        </div>
      </div>

      <div className="floating-element pos-3" style={{ '--rot': '5deg' } as React.CSSProperties}>
        <img className="floating-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=C" alt="" />
        <div className="floating-text">
          <div className="name"></div>
          <div className="price"></div>
        </div>
      </div>

      <div className="floating-element pos-4" style={{ '--rot': '-10deg' } as React.CSSProperties}>
        <img className="floating-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=D" alt="" />
        <div className="floating-text">
          <div className="name"></div>
          <div className="price"></div>
        </div>
      </div>

      <div className="landing-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="landing-logo-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '24px' }}>
          <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 5C25.147 5 5 25.147 5 50V95H35V50C35 41.716 41.716 35 50 35C58.284 35 65 41.716 65 50V70H50V95H95V50C95 25.147 74.853 5 50 5Z" fill="#00d5ff" />
          </svg>
          <h1 className="landing-logo" style={{ marginBottom: 0 }}>arcFI</h1>
        </div>
        <p className="landing-subtitle">
          The Agentic Economy on Arc Network.<br />
          Trade ARCKEYS, join exclusive chats, and build your onchain network.
        </p>
        <div className="login-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
          <button className="login-button" onClick={connectWallet} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0', opacity: 0.5 }}>
            <div style={{ flex: 1, height: '1px', background: 'white' }}></div>
            <span style={{ fontSize: '12px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'white' }}></div>
          </div>

          <div className="social-login-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button className="social-button" onClick={() => onLogin(createMockAddress())}>
              <XIcon />
              Twitter
            </button>
            <button className="social-button" onClick={() => onLogin(createMockAddress())}>
              <GoogleIcon />
              Google
            </button>
          </div>

          <button className="social-button" style={{ width: '100%' }} onClick={() => onLogin(createMockAddress())}>
            <Mail size={18} />
            Continue with Email
          </button>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="footer-logo" style={{ gap: '8px' }}>
              <div style={{ background: '#00d5ff', borderRadius: '8px', padding: '6px', display: 'flex', width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M50 5C25.147 5 5 25.147 5 50V95H35V50C35 41.716 41.716 35 50 35C58.284 35 65 41.716 65 50V70H50V95H95V50C95 25.147 74.853 5 50 5Z" fill="white" />
                </svg>
              </div>
              arcFI
            </div>
            <p className="footer-desc">
              arcFI is a stablecoin-native SocialFi platform built on the Arc Network.
              Buy and sell ARCKEYS to your favorite creators, unlock exclusive chatrooms,
              and participate in the agentic onchain economy.
            </p>
            <div className="social-icons">
              <a href="https://x.com/arc" target="_blank" rel="noopener noreferrer" className="footer-icon-link">
                <XIcon />
              </a>
              <a href="https://t.me/arc_network_official" target="_blank" rel="noopener noreferrer" className="footer-icon-link">
                <MessageSquare size={18} />
              </a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div>(c) 2026 arcFI. ALL RIGHTS RESERVED</div>
          <div className="footer-bottom-links">
            <a href="https://docs.arc.network" target="_blank" rel="noopener noreferrer" className="footer-bottom-link">DOCS</a>
            <a href="https://arc.network/terms" target="_blank" rel="noopener noreferrer" className="footer-bottom-link">TERMS</a>
            <a href="https://arc.network/privacy" target="_blank" rel="noopener noreferrer" className="footer-bottom-link">PRIVACY</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
