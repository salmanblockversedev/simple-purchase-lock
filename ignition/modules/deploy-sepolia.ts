import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther, parseUnits } from "ethers";

/**
 * Ignition module for Sepolia Testnet deployment
 * 
 * Deploys:
 * 1. Test ECM Token (1B supply)
 * 2. Test USDT Token (10M supply, 6 decimals)
 * 3. Mock Uniswap V2 Pair
 * 4. ECMSale Contract
 * 
 * Configuration:
 * - Initial reserves: 1M USDT : 2M ECM (1 USDT = 2 ECM)
 * - Sale allocation: 100M ECM
 * - Lock duration: 180 days
 */

const SepoliaDeploymentModule = buildModule("SepoliaDeployment", (m) => {
  // ============ Parameters ============
  const initialECMSupply = m.getParameter("initialECMSupply", parseEther("1000000000")); // 1B ECM
  const saleAllocation = m.getParameter("saleAllocation", parseEther("100000000")); // 100M ECM
  const usdtReserve = m.getParameter("usdtReserve", parseUnits("1000000", 6)); // 1M USDT
  const ecmReserve = m.getParameter("ecmReserve", parseEther("2000000")); // 2M ECM

  // ============ Step 1: Deploy Test ECM Token ============
  const ecmToken = m.contract("ECMToken", [initialECMSupply], {
    id: "ECMToken",
  });


  // ============ Step 2: Deploy Test USDT Token ============
  const usdtToken = m.contract("MockUSDT", [], {
    id: "MockUSDT",
    after: [ecmToken]
  });

  // Mint test USDT for deployer
  const deployer = m.getAccount(0);
  m.call(usdtToken, "mint", [deployer, parseUnits("10000000", 6)], {
    id: "MintTestUSDT",
    after: [usdtToken],
  });

  // ============ Step 3: Deploy Mock Uniswap V2 Pair ============
  const pair = m.contract("MockUniswapV2Pair", [usdtToken, ecmToken], {
    id: "MockUniswapV2Pair",
    after: [ecmToken, usdtToken],
  });

  // Set initial reserves: 1M USDT : 2M ECM
  m.call(pair, "setReserves", [usdtReserve, ecmReserve], {
    id: "SetInitialReserves",
    after: [pair],
  });

  // ============ Step 4: Deploy ECMSale Contract ============
  const ecmSale = m.contract("ECMSale", [ecmToken, usdtToken, pair], {
    id: "ECMSale",
    after: [ecmToken, usdtToken, pair],
  });

  // ============ Step 5: Transfer ECM to Sale Contract ============
  m.call(ecmToken, "transfer", [ecmSale, saleAllocation], {
    id: "FundSaleContract",
    after: [ecmSale],
  });

  // ============ Return deployed contracts ============
  return {
    ecmToken,
    usdtToken,
    pair,
    ecmSale,
  };
});

export default SepoliaDeploymentModule;
