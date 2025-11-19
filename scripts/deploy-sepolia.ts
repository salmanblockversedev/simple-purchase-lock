import { ethers } from "hardhat";
import { parseEther, parseUnits } from "ethers";

/**
 * Deployment script for Sepolia Testnet
 * 
 * This script deploys:
 * 1. Test ECM Token (1B supply)
 * 2. Test USDT Token (1M supply with 6 decimals)
 * 3. Mock Uniswap V2 Pair
 * 4. ECMSale Contract
 * 
 * Initial configuration:
 * - Lock duration: 180 days
 * - Initial reserves: 1M USDT : 2M ECM (1 USDT = 2 ECM)
 * - Sale allocation: 100M ECM
 */

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("================================================");
  console.log("🚀 Deploying to Sepolia Testnet");
  console.log("================================================");
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // ============ Step 1: Deploy Test ECM Token ============
  console.log("📝 Step 1: Deploying Test ECM Token...");
  const ECMTokenFactory = await ethers.getContractFactory("ECMToken");
  const initialSupply = parseEther("1000000000"); // 1 Billion tokens
  const ecmToken = await ECMTokenFactory.deploy(initialSupply);
  await ecmToken.waitForDeployment();
  const ecmAddress = await ecmToken.getAddress();
  console.log("✅ ECM Token deployed to:", ecmAddress);
  console.log("   Initial supply:", ethers.formatEther(initialSupply), "ECM");
  console.log("");

  // ============ Step 2: Deploy Test USDT Token (6 decimals) ============
  console.log("📝 Step 2: Deploying Test USDT Token...");
  const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDTFactory.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("✅ USDT Token deployed to:", usdtAddress);
  console.log("   Decimals: 6");
  console.log("");

  // Mint test USDT for initial liquidity setup
  console.log("💰 Minting 10M test USDT for deployer...");
  await usdt.mint(deployer.address, parseUnits("10000000", 6));
  console.log("✅ USDT minted");
  console.log("");

  // ============ Step 3: Deploy Mock Uniswap V2 Pair ============
  console.log("📝 Step 3: Deploying Mock Uniswap V2 Pair...");
  const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
  const pair = await MockPairFactory.deploy(usdtAddress, ecmAddress);
  await pair.waitForDeployment();
  const pairAddress = await pair.getAddress();
  console.log("✅ Uniswap V2 Pair deployed to:", pairAddress);
  console.log("");

  // Set initial reserves: 1M USDT : 2M ECM (1 USDT = 2 ECM)
  console.log("🔧 Setting initial reserves...");
  const usdtReserve = parseUnits("1000000", 6); // 1M USDT
  const ecmReserve = parseEther("2000000"); // 2M ECM
  await pair.setReserves(usdtReserve, ecmReserve);
  console.log("✅ Reserves set:");
  console.log("   USDT Reserve:", ethers.formatUnits(usdtReserve, 6), "USDT");
  console.log("   ECM Reserve:", ethers.formatEther(ecmReserve), "ECM");
  console.log("   Price: 1 USDT = 2 ECM");
  console.log("");

  // ============ Step 4: Deploy ECMSale Contract ============
  console.log("📝 Step 4: Deploying ECMSale Contract...");
  const ECMSaleFactory = await ethers.getContractFactory("ECMSale");
  const sale = await ECMSaleFactory.deploy(ecmAddress, usdtAddress, pairAddress);
  await sale.waitForDeployment();
  const saleAddress = await sale.getAddress();
  console.log("✅ ECMSale deployed to:", saleAddress);
  console.log("   Lock duration:", (await sale.lockDuration()).toString(), "seconds (180 days)");
  console.log("");

  // ============ Step 5: Fund Sale Contract ============
  console.log("📝 Step 5: Transferring ECM to Sale Contract...");
  const saleAllocation = parseEther("100000000"); // 100M ECM for sale
  await ecmToken.transfer(saleAddress, saleAllocation);
  console.log("✅ Transferred", ethers.formatEther(saleAllocation), "ECM to sale contract");
  console.log("");

  // ============ Deployment Summary ============
  console.log("================================================");
  console.log("✅ DEPLOYMENT COMPLETE - SEPOLIA TESTNET");
  console.log("================================================");
  console.log("");
  console.log("📋 Contract Addresses:");
  console.log("─────────────────────────────────────────────");
  console.log("ECM Token:       ", ecmAddress);
  console.log("USDT Token:      ", usdtAddress);
  console.log("Uniswap V2 Pair: ", pairAddress);
  console.log("ECMSale:         ", saleAddress);
  console.log("");
  console.log("📊 Configuration:");
  console.log("─────────────────────────────────────────────");
  console.log("Total ECM Supply:     ", ethers.formatEther(initialSupply), "ECM");
  console.log("ECM in Sale Contract: ", ethers.formatEther(saleAllocation), "ECM");
  console.log("Lock Duration:        ", "180 days");
  console.log("Initial Price:        ", "1 USDT = 2 ECM");
  console.log("");
  console.log("🔗 Verify on Etherscan:");
  console.log("─────────────────────────────────────────────");
  console.log(`npx hardhat verify --network sepolia ${ecmAddress} "${initialSupply}"`);
  console.log(`npx hardhat verify --network sepolia ${usdtAddress}`);
  console.log(`npx hardhat verify --network sepolia ${pairAddress} "${usdtAddress}" "${ecmAddress}"`);
  console.log(`npx hardhat verify --network sepolia ${saleAddress} "${ecmAddress}" "${usdtAddress}" "${pairAddress}"`);
  console.log("");
  console.log("💡 Next Steps:");
  console.log("─────────────────────────────────────────────");
  console.log("1. Verify contracts on Etherscan using commands above");
  console.log("2. Test purchases with testnet USDT");
  console.log("3. Monitor lock and claim functionality");
  console.log("4. Update frontend with contract addresses");
  console.log("");
  console.log("📝 Save these addresses to your .env file:");
  console.log("─────────────────────────────────────────────");
  console.log(`SEPOLIA_ECM_TOKEN=${ecmAddress}`);
  console.log(`SEPOLIA_USDT_TOKEN=${usdtAddress}`);
  console.log(`SEPOLIA_UNISWAP_PAIR=${pairAddress}`);
  console.log(`SEPOLIA_ECM_SALE=${saleAddress}`);
  console.log("================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
