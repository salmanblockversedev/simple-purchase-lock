// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IUniswapV2Pair.sol";

/**
 * @title ECMSale
 * @dev Sale and lock contract for ECM tokens
 * - Users buy ECM with USDT using Uniswap V2 spot price
 * - Purchased tokens are locked for 6 months
 * - Users can claim tokens after lock period
 * - Admin can withdraw unsold tokens and USDT proceeds
 * - Contract is pausable for emergency situations
 * 
 * Security features:
 * - ReentrancyGuard on all state-changing functions
 * - SafeERC20 for USDT compatibility
 * - Pausable for emergency control
 * - Owner-only admin functions
 */
contract ECMSale is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    IERC20 public immutable ecm;
    IERC20 public immutable usdt;
    IUniswapV2Pair public pair;

    uint256 public lockDuration = 180 days;

    struct Lock {
        uint256 amount;
        uint256 releaseTime;
        bool claimed;
    }

    // per-user locks
    mapping(address => Lock[]) private _userLocks;
    // total amount currently locked (sum of unclaimed locked amounts)
    uint256 public totalLocked;

    // ============ Events ============

    event Purchase(
        address indexed buyer,
        uint256 usdtAmount,
        uint256 ecmAmount,
        uint256 releaseTime,
        uint256 indexed lockIndex
    );
    event Claim(
        address indexed beneficiary,
        uint256 ecmAmount,
        uint256 indexed lockIndex
    );
    event WithdrawECM(address indexed owner, uint256 amount);
    event WithdrawUSDT(address indexed owner, uint256 amount);
    event PairUpdated(address indexed by, address newPair);
    event LockDurationUpdated(uint256 newDuration);

    // ============ Constructor ============

    constructor(address _ecm, address _usdt, address _pair) Ownable(msg.sender) {
        require(_ecm != address(0) && _usdt != address(0), "zero addr");
        ecm = IERC20(_ecm);
        usdt = IERC20(_usdt);
        pair = IUniswapV2Pair(_pair);
    }

    // ============ View Functions ============

    /**
     * @notice Get all locks for a user
     * @param user Address to query locks for
     * @return amounts Array of lock amounts
     * @return releaseTimes Array of lock release timestamps
     * @return claimed Array of claimed status
     */
    function getUserLocks(address user) external view returns (
        uint256[] memory amounts,
        uint256[] memory releaseTimes,
        bool[] memory claimed
    ) {
        Lock[] storage locks = _userLocks[user];
        uint256 n = locks.length;
        amounts = new uint256[](n);
        releaseTimes = new uint256[](n);
        claimed = new bool[](n);
        
        for (uint256 i = 0; i < n; i++) {
            Lock storage L = locks[i];
            amounts[i] = L.amount;
            releaseTimes[i] = L.releaseTime;
            claimed[i] = L.claimed;
        }
    }

    /**
     * @notice Estimate ECM amount for a given USDT input using spot price
     * @dev Uses Uniswap V2 pair reserves directly
     * @param usdtAmount Amount of USDT to spend
     * @return Estimated ECM amount to receive
     */
    function getEstimatedECMForUSDT(uint256 usdtAmount) external view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        address token0 = pair.token0();
        uint256 reserveUSDT;
        uint256 reserveECM;
        
        if (token0 == address(usdt)) {
            reserveUSDT = r0;
            reserveECM = r1;
        } else {
            reserveUSDT = r1;
            reserveECM = r0;
        }
        
        require(reserveUSDT > 0 && reserveECM > 0, "bad reserves");
        // ecmAmount = usdtAmount * reserveECM / reserveUSDT
        return (uint256(usdtAmount) * reserveECM) / reserveUSDT;
    }

    /**
     * @notice Get available ECM that admin can withdraw
     * @dev Available = contract balance - locked tokens
     * @return Amount of ECM available for withdrawal
     */
    function availableECM() public view returns (uint256) {
        uint256 bal = IERC20(ecm).balanceOf(address(this));
        if (bal > totalLocked) {
            return bal - totalLocked;
        } else {
            return 0;
        }
    }

    // ============ User Functions ============

    /**
     * @notice Buy ECM with USDT and lock for 6 months
     * @dev Buyer must approve USDT beforehand
     * @param usdtAmount Amount of USDT to spend
     * @param minECM Minimum ECM to receive (slippage protection)
     */
    function buyWithUSDT(uint256 usdtAmount, uint256 minECM) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(usdtAmount > 0, "zero USDT");
        
        // Get reserves and compute ECM amount
        (uint112 r0, uint112 r1,) = pair.getReserves();
        address token0 = pair.token0();
        uint256 reserveUSDT;
        uint256 reserveECM;
        
        if (token0 == address(usdt)) {
            reserveUSDT = r0;
            reserveECM = r1;
        } else {
            reserveUSDT = r1;
            reserveECM = r0;
        }
        
        require(reserveUSDT > 0 && reserveECM > 0, "invalid reserves");
        
        uint256 ecmAmount = (uint256(usdtAmount) * reserveECM) / reserveUSDT;
        require(ecmAmount >= minECM, "slippage");
        require(ecmAmount <= availableECM(), "insufficient ECM in sale");
        
        // Transfer USDT from buyer
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);
        
        // Create lock
        uint256 releaseTime = block.timestamp + lockDuration;
        _userLocks[msg.sender].push(Lock({
            amount: ecmAmount,
            releaseTime: releaseTime,
            claimed: false
        }));
        uint256 lockIndex = _userLocks[msg.sender].length - 1;
        totalLocked += ecmAmount;
        
        emit Purchase(msg.sender, usdtAmount, ecmAmount, releaseTime, lockIndex);
    }

    /**
     * @notice Claim all unlocked tokens
     * @dev Iterates through all locks and claims those that are unlocked
     */
    function claimAllUnlocked() external nonReentrant whenNotPaused {
        Lock[] storage locks = _userLocks[msg.sender];
        uint256 n = locks.length;
        require(n > 0, "no locks");
        
        uint256 totalToTransfer = 0;
        for (uint256 i = 0; i < n; i++) {
            if (!locks[i].claimed && locks[i].releaseTime <= block.timestamp) {
                locks[i].claimed = true;
                totalToTransfer += locks[i].amount;
                emit Claim(msg.sender, locks[i].amount, i);
            }
        }
        
        require(totalToTransfer > 0, "nothing unlocked");
        totalLocked -= totalToTransfer;
        IERC20(ecm).safeTransfer(msg.sender, totalToTransfer);
    }

    /**
     * @notice Claim specific locks by index
     * @dev More gas efficient when user has many locks
     * @param indices Array of lock indices to claim
     */
    function claimLocks(uint256[] calldata indices) external nonReentrant whenNotPaused {
        Lock[] storage locks = _userLocks[msg.sender];
        uint256 n = locks.length;
        uint256 totalToTransfer = 0;
        
        for (uint256 i = 0; i < indices.length; i++) {
            uint256 idx = indices[i];
            require(idx < n, "invalid index");
            Lock storage L = locks[idx];
            require(!L.claimed, "already claimed");
            require(L.releaseTime <= block.timestamp, "not yet unlocked");
            
            L.claimed = true;
            totalToTransfer += L.amount;
            emit Claim(msg.sender, L.amount, idx);
        }
        
        require(totalToTransfer > 0, "nothing to claim");
        totalLocked -= totalToTransfer;
        IERC20(ecm).safeTransfer(msg.sender, totalToTransfer);
    }

    // ============ Admin Functions ============

    /**
     * @notice Withdraw available ECM (not locked)
     * @dev Only owner can call. Cannot withdraw locked user tokens.
     * @param amount Amount to withdraw
     */
    function withdrawAvailableECM(uint256 amount) external onlyOwner nonReentrant {
        uint256 avail = availableECM();
        require(amount <= avail, "amount > available");
        IERC20(ecm).safeTransfer(msg.sender, amount);
        emit WithdrawECM(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDT proceeds
     * @dev Only owner can call
     * @param amount Amount to withdraw
     */
    function withdrawUSDT(uint256 amount) external onlyOwner nonReentrant {
        uint256 bal = IERC20(usdt).balanceOf(address(this));
        require(amount <= bal, "amount > balance");
        IERC20(usdt).safeTransfer(msg.sender, amount);
        emit WithdrawUSDT(msg.sender, amount);
    }

    /**
     * @notice Update the Uniswap pair address
     * @dev Only owner can call. Use with caution.
     * @param newPair New pair address
     */
    function setPair(address newPair) external onlyOwner {
        pair = IUniswapV2Pair(newPair);
        emit PairUpdated(msg.sender, newPair);
    }

    /**
     * @notice Set lock duration for future purchases
     * @dev Only owner can call. Does not affect existing locks.
     * @param newDuration New lock duration in seconds
     */
    function setLockDuration(uint256 newDuration) external onlyOwner {
        lockDuration = newDuration;
        emit LockDurationUpdated(newDuration);
    }

    /**
     * @notice Pause contract (emergency)
     * @dev Only owner can call. Prevents buy and claim operations.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract
     * @dev Only owner can call
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
