# ECM Token Sale Contract

A secure token sale and lock contract that enables users to purchase ECM tokens with USDT using real-time Uniswap V2 pricing, with purchased tokens automatically locked for 180 days (6 months).

## 🌟 Features

### For Users
- **Buy ECM with USDT**: Purchase ECM tokens at real-time Uniswap V2 spot prices
- **Automatic Token Lock**: Purchased tokens are locked for 180 days (6 months) for security
- **Multiple Locks**: Each purchase creates a separate lock entry for flexibility
- **Batch Claiming**: Claim all unlocked tokens at once or specific locks
- **Slippage Protection**: Set minimum ECM amount to protect against price volatility
- **Price Estimation**: View estimated ECM amount before purchasing

### For Administrators
- **Withdraw Available ECM**: Withdraw unsold tokens (locked user funds are protected)
- **Withdraw USDT Proceeds**: Collect USDT from token sales
- **Update Lock Duration**: Change lock period for future purchases
- **Update Price Oracle**: Switch Uniswap pair if needed
- **Emergency Pause**: Halt all operations in case of emergency

### Security Features
- ✅ **ReentrancyGuard**: Protection against reentrancy attacks on all state-changing functions
- ✅ **SafeERC20**: Compatible with non-standard USDT implementations
- ✅ **Pausable**: Emergency stop mechanism
- ✅ **Ownable**: Admin-only privileged functions
- ✅ **Immutable Tokens**: ECM and USDT addresses cannot be changed after deployment
- ✅ **Lock Protection**: Admin cannot withdraw locked user tokens

## 📋 Contract Overview

### ECMSale.sol
Main sale contract that handles:
- Token purchases with USDT
- 180-day token locks per purchase
- Claiming unlocked tokens
- Admin functions for managing the sale

**Key State Variables:**
- `ecm`: ECM token address (immutable)
- `usdt`: USDT token address (immutable)
- `pair`: Uniswap V2 ECM/USDT pair for pricing
- `lockDuration`: Current lock duration (default: 180 days)
- `totalLocked`: Total ECM currently locked across all users

### ECMToken.sol
Simple ERC20 token:
- Name: ECM
- Symbol: ECM
- Decimals: 18
- Initial supply minted to deployer

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- npm or pnpm
- Hardhat
- Sepolia testnet ETH (for testing)
- Ethereum mainnet ETH (for production)

### Installation

```bash
# Clone the repository
git clone https://github.com/salmanblockversedev/simple-purchase-lock.git
cd simple-purchase-lock

# Install dependencies
npm install
# or
pnpm install
```

### Configuration

Create a `.env` file in the root directory:

```env
# Network RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY

# Private key for deployment
PRIVATE_KEY=your_private_key_here

# Etherscan API key for verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# Mainnet contract addresses (for production deployment)
MAINNET_ECM_TOKEN=0x...          # Your ECM token address
MAINNET_USDT_TOKEN=0xdAC17F958D2ee523a2206206994597C13D831ec7  # Standard USDT
MAINNET_UNISWAP_PAIR=0x...       # ECM/USDT Uniswap V2 pair
```

## 📦 Deployment

### Sepolia Testnet Deployment

Deploy complete test environment (ECM token, Mock USDT, Mock Uniswap pair, Sale contract):

```bash
npm run deploy:testnet
```

This will:
1. Deploy ECMToken (1B supply)
2. Deploy MockUSDT (6 decimals)
3. Deploy MockUniswapV2Pair
4. Set initial reserves (1M USDT : 2M ECM)
5. Deploy ECMSale contract
6. Transfer 100M ECM to sale contract

### Ethereum Mainnet Deployment

**⚠️ IMPORTANT**: Set environment variables first!

```bash
# Ensure these are set in .env:
# MAINNET_ECM_TOKEN=0x...
# MAINNET_UNISWAP_PAIR=0x...

npm run deploy:mainnet
```

This will:
1. Validate all addresses
2. Verify token contracts exist
3. Verify Uniswap pair contains correct tokens
4. Deploy ECMSale contract
5. Display post-deployment checklist

**Post-Deployment Steps:**
1. Transfer ECM tokens to the sale contract
2. Verify contract on Etherscan
3. Test with a small purchase
4. Update frontend with contract address

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run with gas reporting
npm test -- --trace

# Run specific test file
npx hardhat test test/pool-manager.spec.ts
```

**Test Coverage:**
- ✅ Price oracle functionality (27 tests)
- ✅ Lock management (34 tests)
- ✅ USDT compatibility (18 tests)
- ✅ Security features (30 tests)
- ✅ Mathematical invariants (12 tests)
- ✅ Inventory validation (8 tests)
- ✅ Business requirements (6 tests)
- **Total: 135 tests (100% passing)**

## 📖 Usage Guide

### For Users

#### 1. Buy ECM Tokens

```solidity
// Estimate ECM amount
uint256 estimatedECM = ecmSale.getEstimatedECMForUSDT(1000e6); // 1000 USDT

// Approve USDT (do this once or when allowance is insufficient)
usdt.approve(address(ecmSale), 1000e6);

// Buy ECM with slippage protection (5% slippage)
uint256 minECM = estimatedECM * 95 / 100;
ecmSale.buyWithUSDT(1000e6, minECM);
```

#### 2. Check Your Locks

```solidity
// Get all locks for your address
(
    uint256[] memory amounts,
    uint256[] memory releaseTimes,
    bool[] memory claimed
) = ecmSale.getUserLocks(msg.sender);

// Display each lock
for (uint256 i = 0; i < amounts.length; i++) {
    console.log("Lock", i);
    console.log("  Amount:", amounts[i]);
    console.log("  Release Time:", releaseTimes[i]);
    console.log("  Claimed:", claimed[i]);
}
```

#### 3. Claim Unlocked Tokens

```solidity
// Option 1: Claim all unlocked tokens at once
ecmSale.claimAllUnlocked();

// Option 2: Claim specific locks (more gas efficient for many locks)
uint256[] memory indices = new uint256[](2);
indices[0] = 0;  // First lock
indices[1] = 2;  // Third lock
ecmSale.claimLocks(indices);
```

### For Administrators

#### Withdraw Available ECM

```solidity
// Check available amount (excludes locked tokens)
uint256 available = ecmSale.availableECM();

// Withdraw available tokens
ecmSale.withdrawAvailableECM(available);
```

#### Withdraw USDT Proceeds

```solidity
// Check USDT balance
uint256 usdtBalance = usdt.balanceOf(address(ecmSale));

// Withdraw USDT
ecmSale.withdrawUSDT(usdtBalance);
```

#### Update Lock Duration

```solidity
// Set lock duration to 90 days for future purchases
ecmSale.setLockDuration(90 days);
```

#### Emergency Controls

```solidity
// Pause all operations
ecmSale.pause();

// Resume operations
ecmSale.unpause();
```

## 🔐 Security Considerations

### Audited Features
- ✅ Reentrancy protection on all state-changing functions
- ✅ SafeERC20 for USDT compatibility (handles non-standard implementations)
- ✅ Integer overflow protection (Solidity 0.8+)
- ✅ Access control for admin functions
- ✅ Locked token protection (admin cannot withdraw user funds)

### Best Practices
- Always use slippage protection when buying tokens
- Verify lock release times before claiming
- Test on Sepolia testnet before mainnet deployment
- Use multisig wallet for contract ownership on mainnet
- Monitor contract for unusual activity

### Known Limitations
- Price oracle uses Uniswap V2 spot price (subject to manipulation in low liquidity)
- Lock duration changes only affect future purchases
- Claims require gas; users need ETH for claiming

## 📊 Contract Specifications

### ECMSale Contract

| Property | Value |
|----------|-------|
| Solidity Version | 0.8.19+ |
| License | MIT |
| Optimizer | Enabled (200 runs) |
| Deployed Size | 5.111 KiB |

### Functions

#### User Functions
- `buyWithUSDT(uint256 usdtAmount, uint256 minECM)` - Purchase ECM with USDT
- `claimAllUnlocked()` - Claim all unlocked tokens
- `claimLocks(uint256[] calldata indices)` - Claim specific locks
- `getUserLocks(address user)` - View all locks for a user
- `getEstimatedECMForUSDT(uint256 usdtAmount)` - Estimate ECM for USDT

#### Admin Functions
- `withdrawAvailableECM(uint256 amount)` - Withdraw unsold ECM
- `withdrawUSDT(uint256 amount)` - Withdraw USDT proceeds
- `setLockDuration(uint256 newDuration)` - Update lock duration
- `setPair(address newPair)` - Update Uniswap pair
- `pause()` / `unpause()` - Emergency controls

### Events

```solidity
event Purchase(address indexed buyer, uint256 usdtAmount, uint256 ecmAmount, uint256 releaseTime, uint256 indexed lockIndex);
event Claim(address indexed beneficiary, uint256 ecmAmount, uint256 indexed lockIndex);
event WithdrawECM(address indexed owner, uint256 amount);
event WithdrawUSDT(address indexed owner, uint256 amount);
event PairUpdated(address indexed by, address newPair);
event LockDurationUpdated(uint256 newDuration);
```

## 🛠️ Development

### Compile Contracts

```bash
npm run build
```

### Run Tests

```bash
# All tests
npm test

# With logs
npm test:logs

# Specific test file
npx hardhat test test/security-tests.spec.ts
```

### Lint Solidity

```bash
npm run lint
npm run lint:fix
```

### Flatten Contracts

```bash
npm run flatten
```

### Verify Contracts

```bash
# After deployment
npm run verify:network sepolia
npm run verify:network mainnet
```

## 📁 Project Structure

```
simple-purchase-lock/
├── contracts/
│   ├── ECMSale.sol              # Main sale contract
│   ├── ECMToken.sol             # ECM ERC20 token
│   ├── interfaces/
│   │   └── IUniswapV2Pair.sol   # Uniswap V2 pair interface
│   └── test/
│       ├── MockUSDT.sol         # Mock USDT (6 decimals)
│       └── MockUniswapV2Pair.sol # Mock Uniswap pair
├── ignition/
│   └── modules/
│       ├── deploy-sepolia.ts    # Sepolia testnet deployment
│       └── deploy-mainnet.ts    # Mainnet deployment
├── test/
│   ├── pool-manager.spec.ts     # Main functionality tests
│   ├── 02-price-oracle.spec.ts # Price oracle tests
│   ├── 04-locks.spec.ts         # Lock management tests
│   ├── 07-usdt-compatibility.spec.ts # USDT tests
│   ├── 08-security.spec.ts      # Security tests
│   └── ...                      # Additional test suites
├── hardhat.config.ts            # Hardhat configuration
├── package.json                 # Dependencies
└── README.md                    # This file
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Authors

- **Salman Bao** - [@salmanbao](https://github.com/salmanbao)
- **Organization** - [Blockverse Development](https://github.com/salmanblockversedev)

## 🔗 Links

- [GitHub Repository](https://github.com/salmanblockversedev/simple-purchase-lock)
- [Sepolia Etherscan](https://sepolia.etherscan.io/)
- [Ethereum Etherscan](https://etherscan.io/)

## ⚠️ Disclaimer

This smart contract is provided as-is. Users should conduct their own security audits before deploying to mainnet. The authors are not responsible for any loss of funds or unexpected behavior.

## 📞 Support

For questions, issues, or feature requests:
- Open an issue on [GitHub](https://github.com/salmanblockversedev/simple-purchase-lock/issues)
- Contact: salmancodez@gmail.com

---

**Built with ❤️ by Blockverse Development**
