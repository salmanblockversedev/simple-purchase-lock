// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDT
 * @dev Mock USDT that mimics non-standard behavior
 * - 6 decimals (like real USDT)
 * - Optional strict approval mode (requires approval to 0 before new approval)
 * - Compatible with SafeERC20
 */
contract MockUSDT is ERC20 {
    bool public strictApproval = false;
    
    constructor() ERC20("Mock USDT", "USDT") {}
    
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function setStrictApproval(bool enabled) external {
        strictApproval = enabled;
    }
    
    // Override approve to enforce strict mode
    function approve(address spender, uint256 amount) public override returns (bool) {
        if (strictApproval && amount > 0) {
            require(allowance(msg.sender, spender) == 0, "USDT: approve from non-zero");
        }
        return super.approve(spender, amount);
    }
}
