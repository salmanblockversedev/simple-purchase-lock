import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("ECMSale - Claim", function () {
  async function deployFixture() {
    const [owner, buyer1, buyer2] = await ethers.getSigners();

    const ECMTokenFactory = await ethers.getContractFactory("ECMToken");
    const ecmToken = await ECMTokenFactory.deploy(ethers.parseEther("1000000000"));

    const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDTFactory.deploy();

    const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
    const pair = await MockPairFactory.deploy(
      await usdt.getAddress(),
      await ecmToken.getAddress()
    );

    await pair.setReserves(
      ethers.parseUnits("1000000", 6),
      ethers.parseEther("2000000")
    );

    const ECMSaleFactory = await ethers.getContractFactory("ECMSale");
    const sale = await ECMSaleFactory.deploy(
      await ecmToken.getAddress(),
      await usdt.getAddress(),
      await pair.getAddress()
    );

    await ecmToken.transfer(await sale.getAddress(), ethers.parseEther("100000000"));

    await usdt.mint(buyer1.address, ethers.parseUnits("100000", 6));
    await usdt.mint(buyer2.address, ethers.parseUnits("100000", 6));

    return { ecmToken, usdt, pair, sale, owner, buyer1, buyer2 };
  }

  describe("claimAllUnlocked - Success Cases", function () {
    it("Should allow claiming after lock period expires", async function () {
      const { sale, usdt, ecmToken, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Purchase
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Fast forward time past lock period
      await time.increase(181 * 24 * 60 * 60); // 181 days

      // Claim
      const tx = await sale.connect(buyer1).claimAllUnlocked();

      // Check ECM received
      expect(await ecmToken.balanceOf(buyer1.address)).to.equal(expectedECM);

      // Check lock marked as claimed
      const [amounts, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.true;

      // Check totalLocked reduced
      expect(await sale.totalLocked()).to.equal(0);

      // Check event
      await expect(tx).to.emit(sale, "Claim").withArgs(buyer1.address, expectedECM, 0);
    });

    it("Should claim multiple unlocked locks", async function () {
      const { sale, usdt, ecmToken, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Make 3 purchases
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 3n);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Fast forward
      await time.increase(181 * 24 * 60 * 60);

      // Claim all
      await sale.connect(buyer1).claimAllUnlocked();

      // Check total received
      expect(await ecmToken.balanceOf(buyer1.address)).to.equal(expectedECM * 3n);

      // Check all claimed
      const [, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.true;
      expect(claimed[1]).to.be.true;
      expect(claimed[2]).to.be.true;
    });

    it("Should only claim unlocked locks (partial claim)", async function () {
      const { sale, usdt, ecmToken, buyer1, owner } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // First purchase
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 2n);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Fast forward 100 days
      await time.increase(100 * 24 * 60 * 60);

      // Second purchase (with new lock period)
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Fast forward another 90 days (total 190 days from first purchase, 90 from second)
      await time.increase(90 * 24 * 60 * 60);

      // Claim - should only claim first lock
      await sale.connect(buyer1).claimAllUnlocked();

      expect(await ecmToken.balanceOf(buyer1.address)).to.equal(expectedECM);

      const [, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.true; // First lock claimed
      expect(claimed[1]).to.be.false; // Second lock still locked
    });
  });

  describe("claimAllUnlocked - Validation", function () {
    it("Should revert when user has no locks", async function () {
      const { sale, buyer1 } = await loadFixture(deployFixture);

      await expect(sale.connect(buyer1).claimAllUnlocked()).to.be.revertedWith("no locks");
    });

    it("Should revert when nothing is unlocked yet", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Try to claim before lock period
      await expect(sale.connect(buyer1).claimAllUnlocked()).to.be.revertedWith("nothing unlocked");
    });

    it("Should revert when contract is paused", async function () {
      const { sale, usdt, buyer1, owner } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await time.increase(181 * 24 * 60 * 60);

      // Pause
      await sale.connect(owner).pause();

      await expect(
        sale.connect(buyer1).claimAllUnlocked()
      ).to.be.revertedWithCustomError(sale, "EnforcedPause");
    });

    it("Should revert when trying to claim already claimed locks", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await time.increase(181 * 24 * 60 * 60);

      // First claim
      await sale.connect(buyer1).claimAllUnlocked();

      // Try to claim again
      await expect(sale.connect(buyer1).claimAllUnlocked()).to.be.revertedWith("nothing unlocked");
    });
  });

  describe("claimLocks - Specific Indices", function () {
    it("Should claim specific locks by index", async function () {
      const { sale, usdt, ecmToken, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Make 5 purchases
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 5n);
      for (let i = 0; i < 5; i++) {
        await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      }

      await time.increase(181 * 24 * 60 * 60);

      // Claim only indices 0, 2, 4
      await sale.connect(buyer1).claimLocks([0, 2, 4]);

      // Should receive 3 * expectedECM
      expect(await ecmToken.balanceOf(buyer1.address)).to.equal(expectedECM * 3n);

      // Check claimed status
      const [, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.true;
      expect(claimed[1]).to.be.false;
      expect(claimed[2]).to.be.true;
      expect(claimed[3]).to.be.false;
      expect(claimed[4]).to.be.true;
    });

    it("Should revert when index is invalid", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await time.increase(181 * 24 * 60 * 60);

      // Try to claim index 5 (only index 0 exists)
      await expect(sale.connect(buyer1).claimLocks([5])).to.be.revertedWith("invalid index");
    });

    it("Should revert when lock is not yet unlocked", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Don't fast forward time

      await expect(sale.connect(buyer1).claimLocks([0])).to.be.revertedWith("not yet unlocked");
    });

    it("Should revert when lock already claimed", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await time.increase(181 * 24 * 60 * 60);

      // Claim once
      await sale.connect(buyer1).claimLocks([0]);

      // Try to claim same lock again
      await expect(sale.connect(buyer1).claimLocks([0])).to.be.revertedWith("already claimed");
    });
  });
});
