import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ECMToken, ECMSale, MockUSDT, MockUniswapV2Pair } from "../typechain-types";

describe("ECMSale - Deployment", function () {
  // Fixture to deploy all contracts
  async function deployFixture() {
    const [owner, buyer1, buyer2] = await ethers.getSigners();

    // Deploy ECM Token with 1 billion initial supply
    const ECMTokenFactory = await ethers.getContractFactory("ECMToken");
    const initialSupply = ethers.parseEther("1000000000"); // 1B tokens
    const ecmToken = await ECMTokenFactory.deploy(initialSupply);

    // Deploy Mock USDT (6 decimals)
    const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDTFactory.deploy();

    // Deploy Mock Uniswap V2 Pair
    const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
    const pair = await MockPairFactory.deploy(
      await usdt.getAddress(),
      await ecmToken.getAddress()
    );

    // Set initial reserves: 1M USDT and 2M ECM (1 USDT = 2 ECM)
    const usdtReserve = ethers.parseUnits("1000000", 6); // 1M USDT (6 decimals)
    const ecmReserve = ethers.parseEther("2000000"); // 2M ECM (18 decimals)
    await pair.setReserves(usdtReserve, ecmReserve);

    // Deploy ECMSale
    const ECMSaleFactory = await ethers.getContractFactory("ECMSale");
    const sale = await ECMSaleFactory.deploy(
      await ecmToken.getAddress(),
      await usdt.getAddress(),
      await pair.getAddress()
    );

    // Transfer ECM to sale contract (100M tokens for sale)
    const saleAllocation = ethers.parseEther("100000000"); // 100M
    await ecmToken.transfer(await sale.getAddress(), saleAllocation);

    // Mint USDT to buyers
    await usdt.mint(buyer1.address, ethers.parseUnits("100000", 6)); // 100k USDT
    await usdt.mint(buyer2.address, ethers.parseUnits("100000", 6)); // 100k USDT

    return { ecmToken, usdt, pair, sale, owner, buyer1, buyer2, saleAllocation };
  }

  describe("Deployment", function () {
    it("Should deploy ECMToken with correct parameters", async function () {
      const { ecmToken, owner } = await loadFixture(deployFixture);

      expect(await ecmToken.name()).to.equal("ECM");
      expect(await ecmToken.symbol()).to.equal("ECM");
      expect(await ecmToken.decimals()).to.equal(18);
      expect(await ecmToken.owner()).to.equal(owner.address);
    });

    it("Should deploy ECMSale with correct parameters", async function () {
      const { sale, ecmToken, usdt, pair, owner } = await loadFixture(deployFixture);

      expect(await sale.ecm()).to.equal(await ecmToken.getAddress());
      expect(await sale.usdt()).to.equal(await usdt.getAddress());
      expect(await sale.pair()).to.equal(await pair.getAddress());
      expect(await sale.owner()).to.equal(owner.address);
      expect(await sale.lockDuration()).to.equal(180 * 24 * 60 * 60); // 180 days
      expect(await sale.totalLocked()).to.equal(0);
    });

    it("Should have correct initial ECM balance in sale contract", async function () {
      const { sale, ecmToken, saleAllocation } = await loadFixture(deployFixture);

      const balance = await ecmToken.balanceOf(await sale.getAddress());
      expect(balance).to.equal(saleAllocation);
    });

    it("Should revert deployment with zero address", async function () {
      const { usdt, pair } = await loadFixture(deployFixture);
      const ECMSaleFactory = await ethers.getContractFactory("ECMSale");

      await expect(
        ECMSaleFactory.deploy(ethers.ZeroAddress, await usdt.getAddress(), await pair.getAddress())
      ).to.be.revertedWith("zero addr");

      await expect(
        ECMSaleFactory.deploy(await usdt.getAddress(), ethers.ZeroAddress, await pair.getAddress())
      ).to.be.revertedWith("zero addr");
    });
  });

  describe("View Functions", function () {
    it("Should return correct available ECM", async function () {
      const { sale, saleAllocation } = await loadFixture(deployFixture);

      const available = await sale.availableECM();
      expect(available).to.equal(saleAllocation); // All available initially
    });

    it("Should return empty locks for new user", async function () {
      const { sale, buyer1 } = await loadFixture(deployFixture);

      const [amounts, releaseTimes, claimed] = await sale.getUserLocks(buyer1.address);
      expect(amounts.length).to.equal(0);
      expect(releaseTimes.length).to.equal(0);
      expect(claimed.length).to.equal(0);
    });

    it("Should estimate ECM correctly", async function () {
      const { sale } = await loadFixture(deployFixture);

      // With reserves: 1M USDT and 2M ECM
      // 1000 USDT should give 2000 ECM
      const usdtAmount = ethers.parseUnits("1000", 6); // 1000 USDT
      const expectedECM = ethers.parseEther("2000"); // 2000 ECM

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });
  });
});
