// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITarget {
    function buyWithUSDT(uint256 usdtAmount, uint256 minECM) external;
    function claimAllUnlocked() external;
}

/**
 * @title MockMaliciousToken
 * @dev Token that attempts reentrancy attacks during transfer/transferFrom
 * Used for testing reentrancy guards
 */
contract MockMaliciousToken is ERC20 {
    address public target;
    bool public shouldAttack;
    string public attackType; // "buy" or "claim"
    
    constructor() ERC20("Malicious", "MAL") {}
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function setAttackConfig(address _target, string memory _attackType) external {
        target = _target;
        attackType = _attackType;
        shouldAttack = true;
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (shouldAttack && target != address(0)) {
            shouldAttack = false; // Prevent infinite recursion
            
            if (keccak256(bytes(attackType)) == keccak256(bytes("claim"))) {
                ITarget(target).claimAllUnlocked();
            }
        }
        return super.transfer(to, amount);
    }
    
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (shouldAttack && target != address(0)) {
            shouldAttack = false; // Prevent infinite recursion
            
            if (keccak256(bytes(attackType)) == keccak256(bytes("buy"))) {
                ITarget(target).buyWithUSDT(amount, 0);
            }
        }
        return super.transferFrom(from, to, amount);
    }
}
