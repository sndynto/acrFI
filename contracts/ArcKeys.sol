// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcKeys (v2, hardened)
/// @notice SocialFi creator keys with a quadratic bonding curve and holder-gated
///         messages. v2 hardens the v1 audit findings:
///         - C-1/H-1: fees are PULL-payments (withdraw), so a reverting/blocklisted
///           creator or protocol destination can never freeze trades.
///         - M-1: buyKeys/sellKeys take slippage bounds (maxCost / minProceeds).
///         - L-1: two-step ownership transfer.
///         - L-3: bounded profile string lengths.
contract ArcKeys {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant CURVE_DENOMINATOR = 100;
    uint256 public constant MAX_BATCH_SIZE = 50;
    uint256 public constant MAX_NAME_LEN = 64;
    uint256 public constant MAX_HANDLE_LEN = 32;
    uint256 public constant MAX_URI_LEN = 256;

    address public owner;
    address public pendingOwner;
    address public protocolFeeDestination;
    uint256 public protocolFeeBps = 500;
    uint256 public creatorFeeBps = 500;
    bool private _locked;

    struct Profile {
        string name;
        string handle;
        string avatarURI;
        bool exists;
    }

    struct Quote {
        uint256 grossPrice;
        uint256 protocolFee;
        uint256 creatorFee;
        uint256 net;
    }

    mapping(address subject => Profile profile) private _profiles;
    mapping(address subject => uint256 supply) public totalSupply;
    mapping(address subject => mapping(address holder => uint256 balance)) public balanceOf;
    /// @notice Pull-payment balances (fees, and any credited amounts).
    mapping(address account => uint256 amount) public pendingWithdrawals;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event FeesUpdated(address indexed protocolFeeDestination, uint256 protocolFeeBps, uint256 creatorFeeBps);
    event ProfileUpdated(address indexed subject, string name, string handle, string avatarURI);
    event Trade(
        address indexed trader,
        address indexed subject,
        bool indexed isBuy,
        uint256 amount,
        uint256 grossPrice,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 supply
    );
    event MessageSent(address indexed sender, address indexed subject, string message);
    event Withdrawal(address indexed to, uint256 amount);

    error NotOwner();
    error NotPendingOwner();
    error InvalidAddress();
    error InvalidAmount();
    error BatchTooLarge();
    error InsufficientPayment();
    error InsufficientKeys();
    error FeeTooHigh();
    error TransferFailed();
    error EmptyMessage();
    error Reentrancy();
    error SlippageExceeded();
    error NothingToWithdraw();
    error StringTooLong();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address initialProtocolFeeDestination) {
        if (initialProtocolFeeDestination == address(0)) revert InvalidAddress();

        owner = msg.sender;
        protocolFeeDestination = initialProtocolFeeDestination;

        emit OwnershipTransferred(address(0), msg.sender);
        emit FeesUpdated(initialProtocolFeeDestination, protocolFeeBps, creatorFeeBps);
    }

    // --- Ownership (two-step) ---

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function setFees(address newProtocolFeeDestination, uint256 newProtocolFeeBps, uint256 newCreatorFeeBps) external onlyOwner {
        if (newProtocolFeeDestination == address(0)) revert InvalidAddress();
        if (newProtocolFeeBps + newCreatorFeeBps > 2_000) revert FeeTooHigh();

        protocolFeeDestination = newProtocolFeeDestination;
        protocolFeeBps = newProtocolFeeBps;
        creatorFeeBps = newCreatorFeeBps;

        emit FeesUpdated(newProtocolFeeDestination, newProtocolFeeBps, newCreatorFeeBps);
    }

    // --- Profiles ---

    function updateProfile(string calldata name, string calldata handle, string calldata avatarURI) external {
        if (bytes(name).length > MAX_NAME_LEN) revert StringTooLong();
        if (bytes(handle).length > MAX_HANDLE_LEN) revert StringTooLong();
        if (bytes(avatarURI).length > MAX_URI_LEN) revert StringTooLong();

        _profiles[msg.sender] = Profile({ name: name, handle: handle, avatarURI: avatarURI, exists: true });
        emit ProfileUpdated(msg.sender, name, handle, avatarURI);
    }

    function getProfile(address subject) external view returns (string memory name, string memory handle, string memory avatarURI, bool exists) {
        Profile storage profile = _profiles[subject];
        return (profile.name, profile.handle, profile.avatarURI, profile.exists);
    }

    // --- Pricing (view) ---

    function getPrice(uint256 supply) public pure returns (uint256) {
        return (supply * supply * 1 ether) / CURVE_DENOMINATOR;
    }

    function getBuyPrice(address subject, uint256 amount) public view returns (uint256) {
        _validateAmount(amount);
        uint256 supply = totalSupply[subject];
        uint256 price;
        for (uint256 i = 0; i < amount; i++) {
            price += getPrice(supply + i);
        }
        return price;
    }

    function getSellPrice(address subject, uint256 amount) public view returns (uint256) {
        _validateAmount(amount);
        uint256 supply = totalSupply[subject];
        if (supply < amount) revert InsufficientKeys();
        uint256 price;
        for (uint256 i = 0; i < amount; i++) {
            price += getPrice(supply - i - 1);
        }
        return price;
    }

    function getBuyPriceAfterFee(address subject, uint256 amount) external view returns (uint256 total, uint256 grossPrice, uint256 protocolFee, uint256 creatorFee) {
        Quote memory quote = _getBuyQuote(subject, amount);
        return (quote.net, quote.grossPrice, quote.protocolFee, quote.creatorFee);
    }

    function getSellPriceAfterFee(address subject, uint256 amount) external view returns (uint256 payout, uint256 grossPrice, uint256 protocolFee, uint256 creatorFee) {
        Quote memory quote = _getSellQuote(subject, amount);
        return (quote.net, quote.grossPrice, quote.protocolFee, quote.creatorFee);
    }

    // --- Trading ---

    /// @param maxCost Maximum total the buyer is willing to pay (slippage guard).
    function buyKeys(address subject, uint256 amount, uint256 maxCost) external payable nonReentrant {
        if (subject == address(0)) revert InvalidAddress();
        _validateAmount(amount);

        Quote memory quote = _getBuyQuote(subject, amount);
        if (quote.net > maxCost) revert SlippageExceeded();
        if (msg.value < quote.net) revert InsufficientPayment();

        balanceOf[subject][msg.sender] += amount;
        totalSupply[subject] += amount;
        uint256 newSupply = totalSupply[subject];

        // Fees are credited (pull-payment): a bad recipient can never block the trade.
        _credit(protocolFeeDestination, quote.protocolFee);
        _credit(subject, quote.creatorFee);

        // Refund surplus to the buyer (their own address; self-inflicted if it reverts).
        uint256 refund = msg.value - quote.net;
        if (refund > 0) _sendValue(msg.sender, refund);

        emit Trade(msg.sender, subject, true, amount, quote.grossPrice, quote.protocolFee, quote.creatorFee, newSupply);
    }

    /// @param minProceeds Minimum the seller is willing to receive (slippage guard).
    function sellKeys(address subject, uint256 amount, uint256 minProceeds) external nonReentrant {
        if (subject == address(0)) revert InvalidAddress();
        _validateAmount(amount);
        if (balanceOf[subject][msg.sender] < amount) revert InsufficientKeys();

        Quote memory quote = _getSellQuote(subject, amount);
        if (quote.net < minProceeds) revert SlippageExceeded();

        balanceOf[subject][msg.sender] -= amount;
        totalSupply[subject] -= amount;
        uint256 newSupply = totalSupply[subject];

        _credit(protocolFeeDestination, quote.protocolFee);
        _credit(subject, quote.creatorFee);
        // Seller payout pushed to their own address (self-inflicted if it reverts).
        _sendValue(msg.sender, quote.net);

        emit Trade(msg.sender, subject, false, amount, quote.grossPrice, quote.protocolFee, quote.creatorFee, newSupply);
    }

    function sendMessage(address subject, string calldata message) external {
        if (bytes(message).length == 0) revert EmptyMessage();
        if (balanceOf[subject][msg.sender] == 0 && msg.sender != subject) revert InsufficientKeys();
        emit MessageSent(msg.sender, subject, message);
    }

    // --- Withdrawals (pull-payment) ---

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0; // effect before interaction
        _sendValue(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
    }

    // --- Internals ---

    function _validateAmount(uint256 amount) private pure {
        if (amount == 0) revert InvalidAmount();
        if (amount > MAX_BATCH_SIZE) revert BatchTooLarge();
    }

    function _fee(uint256 amount, uint256 bps) private pure returns (uint256) {
        return (amount * bps) / BPS_DENOMINATOR;
    }

    function _getBuyQuote(address subject, uint256 amount) private view returns (Quote memory quote) {
        quote.grossPrice = getBuyPrice(subject, amount);
        quote.protocolFee = _fee(quote.grossPrice, protocolFeeBps);
        quote.creatorFee = _fee(quote.grossPrice, creatorFeeBps);
        quote.net = quote.grossPrice + quote.protocolFee + quote.creatorFee;
    }

    function _getSellQuote(address subject, uint256 amount) private view returns (Quote memory quote) {
        quote.grossPrice = getSellPrice(subject, amount);
        quote.protocolFee = _fee(quote.grossPrice, protocolFeeBps);
        quote.creatorFee = _fee(quote.grossPrice, creatorFeeBps);
        quote.net = quote.grossPrice - quote.protocolFee - quote.creatorFee;
    }

    function _credit(address to, uint256 amount) private {
        if (amount == 0) return;
        pendingWithdrawals[to] += amount;
    }

    function _sendValue(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool success, ) = payable(to).call{ value: amount }("");
        if (!success) revert TransferFailed();
    }
}
