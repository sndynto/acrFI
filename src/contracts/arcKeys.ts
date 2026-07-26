// Deployed ArcKeys address on Arc Testnet. Uses VITE_ARC_KEYS_CONTRACT_ADDRESS
// from .env when set, otherwise falls back to the known deployment so the app
// always talks to the real contract (no .env required).
//
// NOTE: After deploying the hardened v2 contract, replace this fallback with the
// NEW address, and update ARC_KEYS_DEPLOY_BLOCK in arcKeysClient.ts.
export const ARC_KEYS_CONTRACT_ADDRESS =
  import.meta.env.VITE_ARC_KEYS_CONTRACT_ADDRESS ||
  '0x6c0a0eCf7c147CFFE2a9f524cdc2A89A0a841bA4'; // ArcKeys v2 (hardened)

// ABI for ArcKeys v2 (hardened): pull-payment fees, slippage bounds, two-step ownership.
export const ARC_KEYS_ABI = [
  'constructor(address initialProtocolFeeDestination)',
  'event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  'event FeesUpdated(address indexed protocolFeeDestination, uint256 protocolFeeBps, uint256 creatorFeeBps)',
  'event ProfileUpdated(address indexed subject, string name, string handle, string avatarURI)',
  'event Trade(address indexed trader, address indexed subject, bool indexed isBuy, uint256 amount, uint256 grossPrice, uint256 protocolFee, uint256 creatorFee, uint256 supply)',
  'event MessageSent(address indexed sender, address indexed subject, string message)',
  'event Withdrawal(address indexed to, uint256 amount)',
  'error NotOwner()',
  'error NotPendingOwner()',
  'error InvalidAddress()',
  'error InvalidAmount()',
  'error BatchTooLarge()',
  'error InsufficientPayment()',
  'error InsufficientKeys()',
  'error FeeTooHigh()',
  'error TransferFailed()',
  'error EmptyMessage()',
  'error Reentrancy()',
  'error SlippageExceeded()',
  'error NothingToWithdraw()',
  'error StringTooLong()',
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function protocolFeeDestination() view returns (address)',
  'function protocolFeeBps() view returns (uint256)',
  'function creatorFeeBps() view returns (uint256)',
  'function totalSupply(address subject) view returns (uint256)',
  'function balanceOf(address subject, address holder) view returns (uint256)',
  'function pendingWithdrawals(address account) view returns (uint256)',
  'function transferOwnership(address newOwner)',
  'function acceptOwnership()',
  'function setFees(address newProtocolFeeDestination, uint256 newProtocolFeeBps, uint256 newCreatorFeeBps)',
  'function updateProfile(string name, string handle, string avatarURI)',
  'function getProfile(address subject) view returns (string name, string handle, string avatarURI, bool exists)',
  'function getPrice(uint256 supply) pure returns (uint256)',
  'function getBuyPrice(address subject, uint256 amount) view returns (uint256)',
  'function getSellPrice(address subject, uint256 amount) view returns (uint256)',
  'function getBuyPriceAfterFee(address subject, uint256 amount) view returns (uint256 total, uint256 grossPrice, uint256 protocolFee, uint256 creatorFee)',
  'function getSellPriceAfterFee(address subject, uint256 amount) view returns (uint256 payout, uint256 grossPrice, uint256 protocolFee, uint256 creatorFee)',
  'function buyKeys(address subject, uint256 amount, uint256 maxCost) payable',
  'function sellKeys(address subject, uint256 amount, uint256 minProceeds)',
  'function sendMessage(address subject, string message)',
  'function withdraw()',
] as const;
