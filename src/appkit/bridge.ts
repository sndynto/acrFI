import { ethers } from 'ethers';

/**
 * USDC bridge into Arc Testnet implemented DIRECTLY on Circle CCTP v2 with ethers
 * — NO @circle-fin packages required (nothing extra to npm install).
 *
 * Flow: approve USDC → depositForBurn on the source chain → poll Circle's
 * attestation service → switch wallet to Arc → receiveMessage (mint) on Arc.
 *
 * All CCTP v2 contracts share the same address on every EVM chain.
 * Testnet only. USDC on source chains is 6 decimals.
 */

// CCTP v2 contracts (identical address on all supported EVM chains).
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const MESSAGE_TRANSMITTER_V2 = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';

const ARC_DOMAIN = 26;
const ARC_CHAIN_ID_HEX = '0x4CEF52'; // 5042002
const ZERO_BYTES32 = '0x' + '0'.repeat(64);
const IRIS = 'https://iris-api-sandbox.circle.com/v2/messages';
const ARC_EXPLORER = 'https://testnet.arcscan.app';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Eip1193 = { request: (args: { method: string; params?: any[] }) => Promise<any> };

interface SourceChain {
  id: string;
  label: string;
  chainIdHex: string;
  domain: number;
  usdc: string;
  explorer: string;
  addParams: Record<string, unknown>;
}

/** Source chains offered in the UI (Circle CCTP v2 testnets → Arc). */
export const BRIDGE_SOURCE_CHAINS: SourceChain[] = [
  {
    id: 'Base_Sepolia', label: 'Base Sepolia', chainIdHex: '0x14A34', domain: 6,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', explorer: 'https://sepolia.basescan.org',
    addParams: {
      chainId: '0x14A34', chainName: 'Base Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://sepolia.base.org'], blockExplorerUrls: ['https://sepolia.basescan.org'],
    },
  },
  {
    id: 'Ethereum_Sepolia', label: 'Ethereum Sepolia', chainIdHex: '0xAA36A7', domain: 0,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', explorer: 'https://sepolia.etherscan.io',
    addParams: {
      chainId: '0xAA36A7', chainName: 'Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'], blockExplorerUrls: ['https://sepolia.etherscan.io'],
    },
  },
  {
    id: 'Arbitrum_Sepolia', label: 'Arbitrum Sepolia', chainIdHex: '0x66EEE', domain: 3,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', explorer: 'https://sepolia.arbiscan.io',
    addParams: {
      chainId: '0x66EEE', chainName: 'Arbitrum Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'], blockExplorerUrls: ['https://sepolia.arbiscan.io'],
    },
  },
  {
    id: 'Avalanche_Fuji', label: 'Avalanche Fuji', chainIdHex: '0xA869', domain: 1,
    usdc: '0x5425890298aed601595a70AB815c96711a31Bc65', explorer: 'https://testnet.snowtrace.io',
    addParams: {
      chainId: '0xA869', chainName: 'Avalanche Fuji',
      nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
      rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'], blockExplorerUrls: ['https://testnet.snowtrace.io'],
    },
  },
];

const ERC20_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];
const TOKEN_MESSENGER_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
];
const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
];

export interface BridgeStepInfo {
  name: string;
  state: 'pending' | 'success' | 'error';
  txHash?: string;
  explorerUrl?: string;
}

export interface BridgeResultInfo {
  state: 'pending' | 'success' | 'error';
  steps: BridgeStepInfo[];
}

export interface BridgeArgs {
  sourceChain: string;
  amount: string;
  onProgress?: (payload: unknown) => void;
  onSteps?: (steps: BridgeStepInfo[]) => void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Switch the injected wallet to `chainIdHex`, adding the chain if unknown. */
const ensureChain = async (eth: Eip1193, chainIdHex: string, addParams?: Record<string, unknown>) => {
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 && addParams) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [addParams] });
    } else {
      throw err;
    }
  }
};

/** Bridge USDC from `sourceChain` into Arc Testnet via CCTP v2. */
export const bridgeUsdcToArc = async ({
  sourceChain,
  amount,
  onProgress,
  onSteps,
}: BridgeArgs): Promise<BridgeResultInfo> => {
  const eth = (typeof window !== 'undefined' ? window.ethereum : undefined) as Eip1193 | undefined;
  if (!eth) throw new Error('No wallet provider found. Connect an EVM wallet first.');

  const chain = BRIDGE_SOURCE_CHAINS.find((c) => c.id === sourceChain);
  if (!chain) throw new Error(`Unsupported source chain: ${sourceChain}`);

  const steps: BridgeStepInfo[] = [
    { name: 'approve', state: 'pending' },
    { name: 'burn', state: 'pending' },
    { name: 'attestation', state: 'pending' },
    { name: 'mint', state: 'pending' },
  ];
  const push = () => onSteps?.(steps.map((s) => ({ ...s })));
  const set = (name: string, patch: Partial<BridgeStepInfo>) => {
    const step = steps.find((s) => s.name === name);
    if (step) Object.assign(step, patch);
    push();
  };
  push();

  try {
    const amount6 = ethers.parseUnits(amount, 6);
    const mintRecipient = ethers.zeroPadValue(ethers.getAddress(await getAddress(eth)), 32);

    // --- Source chain ---
    onProgress?.(`Switching wallet to ${chain.label}…`);
    await ensureChain(eth, chain.chainIdHex, chain.addParams);

    let provider = new ethers.BrowserProvider(eth);
    let signer = await provider.getSigner();

    // 1) Approve USDC to the TokenMessenger
    onProgress?.('Approving USDC…');
    const usdc = new ethers.Contract(chain.usdc, ERC20_ABI, signer);
    const approveTx = await usdc.approve(TOKEN_MESSENGER_V2, amount6);
    await approveTx.wait();
    set('approve', { state: 'success', txHash: approveTx.hash, explorerUrl: `${chain.explorer}/tx/${approveTx.hash}` });

    // 2) depositForBurn (Standard transfer: maxFee 0, finality 2000)
    onProgress?.('Burning USDC on source chain…');
    const messenger = new ethers.Contract(TOKEN_MESSENGER_V2, TOKEN_MESSENGER_ABI, signer);
    const burnTx = await messenger.depositForBurn(
      amount6, ARC_DOMAIN, mintRecipient, chain.usdc, ZERO_BYTES32, 0n, 2000,
    );
    await burnTx.wait();
    set('burn', { state: 'success', txHash: burnTx.hash, explorerUrl: `${chain.explorer}/tx/${burnTx.hash}` });

    // 3) Poll Circle's attestation service
    onProgress?.('Waiting for Circle attestation (can take a few minutes)…');
    const { message, attestation } = await pollAttestation(chain.domain, burnTx.hash);
    set('attestation', { state: 'success' });

    // --- Destination chain (Arc) ---
    onProgress?.('Switching wallet to Arc Testnet…');
    await ensureChain(eth, ARC_CHAIN_ID_HEX);
    provider = new ethers.BrowserProvider(eth);
    signer = await provider.getSigner();

    // 4) receiveMessage → mints USDC on Arc
    onProgress?.('Minting USDC on Arc…');
    const transmitter = new ethers.Contract(MESSAGE_TRANSMITTER_V2, MESSAGE_TRANSMITTER_ABI, signer);
    const mintTx = await transmitter.receiveMessage(message, attestation);
    await mintTx.wait();
    set('mint', { state: 'success', txHash: mintTx.hash, explorerUrl: `${ARC_EXPLORER}/tx/${mintTx.hash}` });

    return { state: 'success', steps };
  } catch (error) {
    const pending = steps.find((s) => s.state === 'pending');
    if (pending) set(pending.name, { state: 'error' });
    throw error instanceof Error ? error : new Error('Bridge failed.');
  }
};

const getAddress = async (eth: Eip1193): Promise<string> => {
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) throw new Error('No wallet account available.');
  return accounts[0];
};

interface IrisMessage { status?: string; message?: string; attestation?: string }

/** Poll iris-api-sandbox until the burn's attestation is complete. */
const pollAttestation = async (
  sourceDomain: number,
  txHash: string,
): Promise<{ message: string; attestation: string }> => {
  const url = `${IRIS}/${sourceDomain}?transactionHash=${txHash}`;
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { messages?: IrisMessage[] };
        const m = data.messages?.[0];
        if (m?.status === 'complete' && m.message && m.attestation) {
          return { message: m.message, attestation: m.attestation };
        }
      }
    } catch {
      // transient network error — keep polling
    }
    await wait(6000);
  }
  throw new Error(
    'Attestation still pending after several minutes. Your burn succeeded — try the bridge again shortly to complete the mint.',
  );
};
