import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Ignition module for Ethereum Mainnet deployment
 * 
 * IMPORTANT: Set these environment variables before deployment:
 * - MAINNET_ECM_TOKEN: Address of deployed ECM token
 * - MAINNET_USDT_TOKEN: Address of USDT token (default: 0xdAC17F958D2ee523a2206206994597C13D831ec7)
 * - MAINNET_UNISWAP_PAIR: Address of ECM/USDT Uniswap V2 pair
 * 
 * This module only deploys:
 * - ECMSale Contract (connected to existing tokens and pair)
 * 
 * Post-deployment steps:
 * 1. Transfer ECM tokens to ECMSale contract
 * 2. Verify contract on Etherscan
 * 3. Test with small purchase
 */

const MainnetDeploymentModule = buildModule("MainnetDeployment", (m) => {
  // ============ Get Existing Contract Addresses ============
  
  // ECM Token address (MUST be set in parameters or environment)
  const ecmTokenAddress = m.getParameter(
    "ecmTokenAddress",
    process.env.MAINNET_ECM_TOKEN || ""
  );

  // USDT Token address (standard USDT on mainnet)
  const usdtTokenAddress = m.getParameter(
    "usdtTokenAddress",
    process.env.MAINNET_USDT_TOKEN || "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  );

  // Uniswap V2 Pair address (MUST be set in parameters or environment)
  const pairAddress = m.getParameter(
    "pairAddress",
    process.env.MAINNET_UNISWAP_PAIR || ""
  );

  // ============ Validation ============
  // Note: Validation of addresses should be done at runtime or via environment setup
  // Ignition modules handle parameter validation automatically

  // ============ Deploy ECMSale Contract ============
  // Pass plain addresses to avoid requiring interface artifacts
  const ecmSale = m.contract("ECMSale", [ecmTokenAddress, usdtTokenAddress, pairAddress], {
    id: "ECMSale",
  });

  // ============ Return deployed contract ============
  return {
    ecmSale,
  };
});

export default MainnetDeploymentModule;
