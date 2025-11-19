import { ethers } from "hardhat";
import { parseEther } from "ethers";

/**
 * Deployment script for Ethereum Mainnet
 * 
 * IMPORTANT: This script assumes you already have:
 * 1. Real ECM Token deployed and address available
 * 2. Real USDT Token (standard USDT: 0xdAC17F958D2ee523a2206206994597C13D831ec7)
 * 3. Real Uniswap V2 Pair for ECM/USDT (must be created before deployment)
 * 
 * This script only deploys:
 * - ECMSale Contract (connected to real tokens and pair)
 * 
 * Configuration:
 * - Lock duration: 180 days
 * - Uses real Uniswap V2 pair for price oracle
 * - Admin must transfer ECM to sale contract after deployment
 */

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("================================================");
  console.log("🚀 Deploying to Ethereum Mainnet");
  console.log("================================================");
  console.log("⚠️  WARNING: YOU ARE DEPLOYING TO MAINNET!");
  console.log("⚠️  PLEASE VERIFY ALL ADDRESSES CAREFULLY!");
  console.log("================================================");
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // ============ Configuration - VERIFY THESE ADDRESSES ============
  console.log("📋 Configuration Check:");
  console.log("─────────────────────────────────────────────");
  
  // TODO: Replace these with your actual mainnet addresses
  const ECM_TOKEN_ADDRESS = process.env.MAINNET_ECM_TOKEN || "";
  const USDT_TOKEN_ADDRESS = process.env.MAINNET_USDT_TOKEN || "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // Standard USDT
  const UNISWAP_PAIR_ADDRESS = process.env.MAINNET_UNISWAP_PAIR || "";

  console.log("ECM Token Address:       ", ECM_TOKEN_ADDRESS);
  console.log("USDT Token Address:      ", USDT_TOKEN_ADDRESS);
  console.log("Uniswap V2 Pair Address: ", UNISWAP_PAIR_ADDRESS);
  console.log("");

  // ============ Validation ============
  if (!ECM_TOKEN_ADDRESS || ECM_TOKEN_ADDRESS === "") {
    throw new Error("❌ ECM_TOKEN_ADDRESS not set! Please set MAINNET_ECM_TOKEN in .env");
  }

  if (!UNISWAP_PAIR_ADDRESS || UNISWAP_PAIR_ADDRESS === "") {
    throw new Error("❌ UNISWAP_PAIR_ADDRESS not set! Please set MAINNET_UNISWAP_PAIR in .env");
  }

  if (!ethers.isAddress(ECM_TOKEN_ADDRESS)) {
    throw new Error("❌ Invalid ECM_TOKEN_ADDRESS");
  }

  if (!ethers.isAddress(USDT_TOKEN_ADDRESS)) {
    throw new Error("❌ Invalid USDT_TOKEN_ADDRESS");
  }

  if (!ethers.isAddress(UNISWAP_PAIR_ADDRESS)) {
    throw new Error("❌ Invalid UNISWAP_PAIR_ADDRESS");
  }

  console.log("✅ Address validation passed");
  console.log("");

  // ============ Verify Token Contracts ============
  console.log("🔍 Verifying token contracts...");
  
  const ecmToken = await ethers.getContractAt("IERC20", ECM_TOKEN_ADDRESS);
  const usdtToken = await ethers.getContractAt("IERC20", USDT_TOKEN_ADDRESS);
  
  try {
    const deployerECMBalance = await ecmToken.balanceOf(deployer.address);
    console.log("✅ ECM Token verified");
    console.log("   Deployer ECM balance:", ethers.formatEther(deployerECMBalance), "ECM");
  } catch (error) {
    throw new Error("❌ Failed to verify ECM token contract");
  }

  try {
    const deployerUSDTBalance = await usdtToken.balanceOf(deployer.address);
    console.log("✅ USDT Token verified");
    console.log("   Deployer USDT balance:", ethers.formatUnits(deployerUSDTBalance, 6), "USDT");
  } catch (error) {
    throw new Error("❌ Failed to verify USDT token contract");
  }
  console.log("");

  // ============ Verify Uniswap Pair ============
  console.log("🔍 Verifying Uniswap V2 Pair...");
  const pair = await ethers.getContractAt("IUniswapV2Pair", UNISWAP_PAIR_ADDRESS);
  
  try {
    const reserves = await pair.getReserves();
    const token0 = await pair.token0();
    const token1 = await pair.token1();
    
    console.log("✅ Uniswap V2 Pair verified");
    console.log("   Token0:", token0);
    console.log("   Token1:", token1);
    console.log("   Reserve0:", reserves[0].toString());
    console.log("   Reserve1:", reserves[1].toString());
    
    // Verify the pair contains our tokens
    const hasECM = token0.toLowerCase() === ECM_TOKEN_ADDRESS.toLowerCase() || 
                   token1.toLowerCase() === ECM_TOKEN_ADDRESS.toLowerCase();
    const hasUSDT = token0.toLowerCase() === USDT_TOKEN_ADDRESS.toLowerCase() || 
                    token1.toLowerCase() === USDT_TOKEN_ADDRESS.toLowerCase();
    
    if (!hasECM || !hasUSDT) {
      throw new Error("❌ Pair does not contain ECM and USDT tokens");
    }
    console.log("✅ Pair contains correct tokens (ECM + USDT)");
  } catch (error) {
    console.error("❌ Failed to verify Uniswap pair:", error);
    throw error;
  }
  console.log("");

  // ============ Final Confirmation ============
  console.log("⚠️  FINAL CONFIRMATION REQUIRED");
  console.log("─────────────────────────────────────────────");
  console.log("You are about to deploy ECMSale to MAINNET with:");
  console.log("  ECM Token:  ", ECM_TOKEN_ADDRESS);
  console.log("  USDT Token: ", USDT_TOKEN_ADDRESS);
  console.log("  Pair:       ", UNISWAP_PAIR_ADDRESS);
  console.log("");
  console.log("⏸️  Pausing for 5 seconds... Press Ctrl+C to cancel");
  console.log("─────────────────────────────────────────────");
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log("");

  // ============ Deploy ECMSale Contract ============
  console.log("📝 Deploying ECMSale Contract...");
  const ECMSaleFactory = await ethers.getContractFactory("ECMSale");
  
  const sale = await ECMSaleFactory.deploy(
    ECM_TOKEN_ADDRESS,
    USDT_TOKEN_ADDRESS,
    UNISWAP_PAIR_ADDRESS
  );
  
  await sale.waitForDeployment();
  const saleAddress = await sale.getAddress();
  
  console.log("✅ ECMSale deployed to:", saleAddress);
  console.log("   Lock duration:", (await sale.lockDuration()).toString(), "seconds (180 days)");
  console.log("");

  // ============ Verify Configuration ============
  console.log("🔍 Verifying deployment configuration...");
  const configEcm = await sale.ecm();
  const configUsdt = await sale.usdt();
  const configPair = await sale.pair();
  const configOwner = await sale.owner();
  
  console.log("✅ Configuration verified:");
  console.log("   ECM Token:  ", configEcm);
  console.log("   USDT Token: ", configUsdt);
  console.log("   Pair:       ", configPair);
  console.log("   Owner:      ", configOwner);
  console.log("");

  // ============ Deployment Summary ============
  console.log("================================================");
  console.log("✅ DEPLOYMENT COMPLETE - ETHEREUM MAINNET");
  console.log("================================================");
  console.log("");
  console.log("📋 Contract Addresses:");
  console.log("─────────────────────────────────────────────");
  console.log("ECMSale:         ", saleAddress);
  console.log("ECM Token:       ", ECM_TOKEN_ADDRESS);
  console.log("USDT Token:      ", USDT_TOKEN_ADDRESS);
  console.log("Uniswap V2 Pair: ", UNISWAP_PAIR_ADDRESS);
  console.log("");
  console.log("📊 Configuration:");
  console.log("─────────────────────────────────────────────");
  console.log("Lock Duration:   ", "180 days");
  console.log("Contract Owner:  ", configOwner);
  console.log("Paused:          ", await sale.paused() ? "Yes" : "No");
  console.log("");
  console.log("🔗 Verify on Etherscan:");
  console.log("─────────────────────────────────────────────");
  console.log(`npx hardhat verify --network mainnet ${saleAddress} "${ECM_TOKEN_ADDRESS}" "${USDT_TOKEN_ADDRESS}" "${UNISWAP_PAIR_ADDRESS}"`);
  console.log("");
  console.log("⚠️  CRITICAL NEXT STEPS (DO NOT SKIP):");
  console.log("─────────────────────────────────────────────");
  console.log("1. ⚠️  Transfer ECM tokens to sale contract:");
  console.log(`   Amount: [YOUR_SALE_ALLOCATION] ECM`);
  console.log(`   To: ${saleAddress}`);
  console.log("");
  console.log("2. ⚠️  Verify contract on Etherscan (use command above)");
  console.log("");
  console.log("3. ⚠️  Test with small purchase first before announcing");
  console.log("");
  console.log("4. ⚠️  Update frontend with contract address:");
  console.log(`   MAINNET_ECM_SALE=${saleAddress}`);
  console.log("");
  console.log("5. ⚠️  Monitor initial transactions carefully");
  console.log("");
  console.log("6. Consider pausing contract initially for safety:");
  console.log(`   await sale.pause();`);
  console.log("");
  console.log("📝 Save to .env file:");
  console.log("─────────────────────────────────────────────");
  console.log(`MAINNET_ECM_SALE=${saleAddress}`);
  console.log("");
  console.log("🔐 Security Checklist:");
  console.log("─────────────────────────────────────────────");
  console.log("☐ Contract verified on Etherscan");
  console.log("☐ ECM tokens transferred to sale contract");
  console.log("☐ Test purchase completed successfully");
  console.log("☐ Price oracle returns expected values");
  console.log("☐ Lock creation confirmed");
  console.log("☐ Admin functions tested (if needed)");
  console.log("☐ Emergency pause/unpause tested");
  console.log("☐ Frontend updated and tested");
  console.log("☐ Monitoring dashboard configured");
  console.log("");
  console.log("================================================");
  console.log("🎉 Deployment successful!");
  console.log("⚠️  Remember to complete all security checks!");
  console.log("================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
