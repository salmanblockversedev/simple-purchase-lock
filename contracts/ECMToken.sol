// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ECMToken
 * @dev Simple ERC20 token with initial supply minted to deployer
 * - Name: ECM
 * - Symbol: ECM
 * - Decimals: 18 (default)
 */
contract ECMToken is ERC20, Ownable {
    constructor(uint256 initialSupply) ERC20("ECM", "ECM") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply);
    }
    
    // Optional: Uncomment if admin should be able to mint more
    // function mint(address to, uint256 amount) external onlyOwner {
    //     _mint(to, amount);
    // }
}
