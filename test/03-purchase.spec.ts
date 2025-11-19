import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("ECMSale - Purchase", function () {
  // Fixture to deploy all contracts
  async function deployFixture() {
    const [owner, buyer1, buyer2] = await ethers.getSigners();

    // Deploy ECM Token
    const ECMTokenFactory = await ethers.getContractFactory("ECMToken");
    const initialSupply = ethers.parseEther("1000000000");
    const ecmToken = await ECMTokenFactory.deploy(initialSupply);

    // Deploy Mock USDT
    const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDTFactory.deploy();

    // Deploy Mock Pair
    const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
    const pair = await MockPairFactory.deploy(
      await usdt.getAddress(),
      await ecmToken.getAddress()
    );

    // Set reserves: 1M USDT and 2M ECM (1 USDT = 2 ECM)
    await pair.setReserves(
      ethers.parseUnits("1000000", 6),
      ethers.parseEther("2000000")
    );

    // Deploy ECMSale
    const ECMSaleFactory = await ethers.getContractFactory("ECMSale");
    const sale = await ECMSaleFactory.deploy(
      await ecmToken.getAddress(),
      await usdt.getAddress(),
      await pair.getAddress()
    );

    // Fund sale contract
    await ecmToken.transfer(await sale.getAddress(), ethers.parseEther("100000000"));

    // Mint USDT to buyers
    await usdt.mint(buyer1.address, ethers.parseUnits("100000", 6));
    await usdt.mint(buyer2.address, ethers.parseUnits("100000", 6));

    return { ecmToken, usdt, pair, sale, owner, buyer1, buyer2 };
  }

  describe("buyWithUSDT - Success Cases", function () {
    it("Should allow user to purchase ECM with USDT", async function () {
      const { sale, usdt, ecmToken, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6); // 1000 USDT
      const expectedECM = ethers.parseEther("2000"); // 2000 ECM

      // Approve USDT
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      // Purchase
      const tx = await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Check USDT transferred
      expect(await usdt.balanceOf(await sale.getAddress())).to.equal(usdtAmount);

      // Check lock created
      const [amounts, releaseTimes, claimed] = await sale.getUserLocks(buyer1.address);
      expect(amounts.length).to.equal(1);
      expect(amounts[0]).to.equal(expectedECM);
      expect(claimed[0]).to.be.false;

      // Check totalLocked updated
      expect(await sale.totalLocked()).to.equal(expectedECM);

      // Check event emitted
      await expect(tx)
        .to.emit(sale, "Purchase")
        .withArgs(buyer1.address, usdtAmount, expectedECM, releaseTimes[0], 0);
    });

    it("Should allow multiple purchases by same user", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Approve sufficient USDT
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 3n);

      // First purchase
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Second purchase
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Third purchase
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Check 3 locks created
      const [amounts] = await sale.getUserLocks(buyer1.address);
      expect(amounts.length).to.equal(3);
      expect(await sale.totalLocked()).to.equal(expectedECM * 3n);
    });

    it("Should handle purchases from multiple users", async function () {
      const { sale, usdt, buyer1, buyer2 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Buyer 1 purchases
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Buyer 2 purchases
      await usdt.connect(buyer2).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer2).buyWithUSDT(usdtAmount, expectedECM);

      // Check locks
      const [buyer1Amounts] = await sale.getUserLocks(buyer1.address);
      const [buyer2Amounts] = await sale.getUserLocks(buyer2.address);

      expect(buyer1Amounts.length).to.equal(1);
      expect(buyer2Amounts.length).to.equal(1);
      expect(await sale.totalLocked()).to.equal(expectedECM * 2n);
    });
  });

  describe("buyWithUSDT - Validation", function () {
    it("Should revert when usdtAmount is zero", async function () {
      const { sale, buyer1 } = await loadFixture(deployFixture);

      await expect(
        sale.connect(buyer1).buyWithUSDT(0, 0)
      ).to.be.revertedWith("zero USDT");
    });

    it("Should revert when contract is paused", async function () {
      const { sale, usdt, buyer1, owner } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      // Pause contract
      await sale.connect(owner).pause();

      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, 0)
      ).to.be.revertedWithCustomError(sale, "EnforcedPause");
    });

    it("Should revert when slippage exceeded (minECM not met)", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const tooHighMinECM = ethers.parseEther("10000"); // Expecting way more than possible

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, tooHighMinECM)
      ).to.be.revertedWith("slippage");
    });

    it("Should revert when insufficient USDT allowance", async function () {
      const { sale, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);

      // No approval given
      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, 0)
      ).to.be.reverted;
    });

    it("Should revert when insufficient ECM in sale", async function () {
      const { sale, usdt, ecmToken, buyer1, owner } = await loadFixture(deployFixture);

      // Withdraw most ECM from sale
      const toWithdraw = ethers.parseEther("99999000"); // Leave only 1000 ECM
      await sale.connect(owner).withdrawAvailableECM(toWithdraw);

      // Try to buy more than available
      const usdtAmount = ethers.parseUnits("1000", 6); // Would get 2000 ECM
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, 0)
      ).to.be.revertedWith("insufficient ECM in sale");
    });
  });

  describe("Lock Duration", function () {
    it("Should create lock with 180 days duration by default", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      const blockBefore = await ethers.provider.getBlock("latest");
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      const [, releaseTimes] = await sale.getUserLocks(buyer1.address);
      const expectedReleaseTime = BigInt(blockBefore!.timestamp + 1) + BigInt(180 * 24 * 60 * 60);

      expect(releaseTimes[0]).to.be.closeTo(expectedReleaseTime, 5); // Allow small variance
    });

    it("Should use new lock duration for future purchases after admin updates it", async function () {
      const { sale, usdt, buyer1, owner } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 2n);

      // First purchase with 180 days
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Admin changes to 90 days
      const newDuration = 90 * 24 * 60 * 60;
      await sale.connect(owner).setLockDuration(newDuration);

      // Second purchase with 90 days
      const blockBefore = await ethers.provider.getBlock("latest");
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      const [, releaseTimes] = await sale.getUserLocks(buyer1.address);

      // First lock should still be 180 days from its creation
      // Second lock should be 90 days from its creation
      const expectedReleaseTime2 = BigInt(blockBefore!.timestamp + 1) + BigInt(newDuration);
      expect(releaseTimes[1]).to.be.closeTo(expectedReleaseTime2, 5);
    });
  });
});
