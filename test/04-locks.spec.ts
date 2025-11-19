import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("ECMSale - Lock Management", function () {
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

  describe("getUserLocks - View Function", function () {
    it("Should return empty arrays for user with no locks", async function () {
      const { sale, buyer1 } = await loadFixture(deployFixture);

      const [amounts, releaseTimes, claimed] = await sale.getUserLocks(buyer1.address);

      expect(amounts.length).to.equal(0);
      expect(releaseTimes.length).to.equal(0);
      expect(claimed.length).to.equal(0);
    });

    it("Should return single lock for user with one purchase", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      const [amounts, releaseTimes, claimed] = await sale.getUserLocks(buyer1.address);

      expect(amounts.length).to.equal(1);
      expect(releaseTimes.length).to.equal(1);
      expect(claimed.length).to.equal(1);
      
      expect(amounts[0]).to.equal(expectedECM);
      expect(claimed[0]).to.be.false;
    });

    it("Should return multiple locks for user with multiple purchases", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("500", 6);
      const expectedECM = ethers.parseEther("1000");

      // Make 3 purchases
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 3n);
      
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      await time.increase(60); // Wait 1 minute between purchases
      
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      await time.increase(60);
      
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      const [amounts, releaseTimes, claimed] = await sale.getUserLocks(buyer1.address);

      expect(amounts.length).to.equal(3);
      expect(releaseTimes.length).to.equal(3);
      expect(claimed.length).to.equal(3);

      // Verify all amounts
      expect(amounts[0]).to.equal(expectedECM);
      expect(amounts[1]).to.equal(expectedECM);
      expect(amounts[2]).to.equal(expectedECM);

      // Verify all unclaimed
      expect(claimed[0]).to.be.false;
      expect(claimed[1]).to.be.false;
      expect(claimed[2]).to.be.false;

      // Verify release times are in order (later purchases have later release times)
      expect(releaseTimes[1]).to.be.gt(releaseTimes[0]);
      expect(releaseTimes[2]).to.be.gt(releaseTimes[1]);
    });

    it("Should return correct arrays with matching indices", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Create 2 locks with different amounts
      const usdtAmount1 = ethers.parseUnits("1000", 6);
      const expectedECM1 = ethers.parseEther("2000");
      
      const usdtAmount2 = ethers.parseUnits("500", 6);
      const expectedECM2 = ethers.parseEther("1000");

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount1 + usdtAmount2);
      
      await sale.connect(buyer1).buyWithUSDT(usdtAmount1, expectedECM1);
      await time.increase(3600); // 1 hour gap
      await sale.connect(buyer1).buyWithUSDT(usdtAmount2, expectedECM2);

      const [amounts, releaseTimes, claimed] = await sale.getUserLocks(buyer1.address);

      // Arrays should have matching indices
      expect(amounts[0]).to.equal(expectedECM1);
      expect(amounts[1]).to.equal(expectedECM2);
      
      expect(claimed[0]).to.be.false;
      expect(claimed[1]).to.be.false;
      
      // Release times should correspond to purchase times
      expect(releaseTimes[0]).to.be.lt(releaseTimes[1]);
    });
  });

  describe("Lock Data Accuracy", function () {
    it("Should have amounts matching purchased amounts", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const purchases = [
        { usdt: ethers.parseUnits("1000", 6), ecm: ethers.parseEther("2000") },
        { usdt: ethers.parseUnits("2000", 6), ecm: ethers.parseEther("4000") },
        { usdt: ethers.parseUnits("500", 6), ecm: ethers.parseEther("1000") },
      ];

      const totalUsdt = purchases.reduce((sum, p) => sum + p.usdt, 0n);
      await usdt.connect(buyer1).approve(await sale.getAddress(), totalUsdt);

      for (const purchase of purchases) {
        await sale.connect(buyer1).buyWithUSDT(purchase.usdt, purchase.ecm);
      }

      const [amounts] = await sale.getUserLocks(buyer1.address);

      expect(amounts[0]).to.equal(purchases[0].ecm);
      expect(amounts[1]).to.equal(purchases[1].ecm);
      expect(amounts[2]).to.equal(purchases[2].ecm);
    });

    it("Should have releaseTimes calculated correctly (purchaseTime + lockDuration)", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      const blockBefore = await ethers.provider.getBlock("latest");
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      const lockDuration = await sale.lockDuration();
      const [, releaseTimes] = await sale.getUserLocks(buyer1.address);

      const expectedReleaseTime = BigInt(blockBefore!.timestamp + 1) + lockDuration;
      
      // Allow small variance for block timing
      expect(releaseTimes[0]).to.be.closeTo(expectedReleaseTime, 5);
    });

    it("Should reflect actual claimed status", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Create 2 locks
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 2n);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Initially both unclaimed
      let [, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.false;
      expect(claimed[1]).to.be.false;

      // Fast forward and claim first lock
      await time.increase(181 * 24 * 60 * 60);
      await sale.connect(buyer1).claimLocks([0]);

      // Check status updated
      [, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.true;  // First lock claimed
      expect(claimed[1]).to.be.false; // Second lock not claimed
    });
  });

  describe("Lock State Transitions", function () {
    it("Should have lock created with claimed = false", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      const [, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.false;
    });

    it("Should not allow claiming before releaseTime", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Try to claim immediately
      await expect(
        sale.connect(buyer1).claimLocks([0])
      ).to.be.revertedWith("not yet unlocked");

      // Try after 90 days (still locked, needs 180)
      await time.increase(90 * 24 * 60 * 60);
      await expect(
        sale.connect(buyer1).claimLocks([0])
      ).to.be.revertedWith("not yet unlocked");
    });

    it("Should allow claiming at exactly releaseTime", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      
      const blockBefore = await ethers.provider.getBlock("latest");
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      const lockDuration = await sale.lockDuration();
      const [, releaseTimes] = await sale.getUserLocks(buyer1.address);

      // Fast forward to exactly releaseTime
      const currentTime = BigInt(blockBefore!.timestamp + 1);
      const timeToWait = releaseTimes[0] - currentTime;
      await time.increase(timeToWait);

      // Should be claimable now
      await expect(
        sale.connect(buyer1).claimLocks([0])
      ).to.not.be.reverted;
    });

    it("Should allow claiming after releaseTime", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Fast forward past releaseTime
      await time.increase(181 * 24 * 60 * 60);

      await expect(
        sale.connect(buyer1).claimLocks([0])
      ).to.not.be.reverted;
    });

    it("Should mark lock as claimed after successful claim", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await time.increase(181 * 24 * 60 * 60);
      await sale.connect(buyer1).claimLocks([0]);

      const [, , claimed] = await sale.getUserLocks(buyer1.address);
      expect(claimed[0]).to.be.true;
    });

    it("Should prevent claiming same lock twice", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await time.increase(181 * 24 * 60 * 60);
      
      // First claim succeeds
      await sale.connect(buyer1).claimLocks([0]);

      // Second claim fails
      await expect(
        sale.connect(buyer1).claimLocks([0])
      ).to.be.revertedWith("already claimed");
    });
  });

  describe("Lock Duration Changes", function () {
    it("Should use new duration for new locks after admin updates", async function () {
      const { sale, usdt, buyer1, owner } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 2n);

      // First purchase with default 180 days
      const block1 = await ethers.provider.getBlock("latest");
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Admin changes duration to 90 days
      const newDuration = 90 * 24 * 60 * 60;
      await sale.connect(owner).setLockDuration(newDuration);

      // Second purchase with new 90 days
      await time.increase(60); // Small gap
      const block2 = await ethers.provider.getBlock("latest");
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      const [, releaseTimes] = await sale.getUserLocks(buyer1.address);

      // First lock should be ~180 days from its creation
      const expected1 = BigInt(block1!.timestamp + 1) + BigInt(180 * 24 * 60 * 60);
      expect(releaseTimes[0]).to.be.closeTo(expected1, 60);

      // Second lock should be ~90 days from its creation
      const expected2 = BigInt(block2!.timestamp + 60 + 1) + BigInt(newDuration);
      expect(releaseTimes[1]).to.be.closeTo(expected2, 60);
    });

    it("Should not affect existing locks when duration changes", async function () {
      const { sale, usdt, buyer1, owner } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      const [, releaseTimesBefore] = await sale.getUserLocks(buyer1.address);
      const originalReleaseTime = releaseTimesBefore[0];

      // Admin changes duration
      await sale.connect(owner).setLockDuration(30 * 24 * 60 * 60);

      // Existing lock should be unchanged
      const [, releaseTimesAfter] = await sale.getUserLocks(buyer1.address);
      expect(releaseTimesAfter[0]).to.equal(originalReleaseTime);
    });
  });

  describe("Multi-User Lock Isolation", function () {
    it("Should keep locks separate between users", async function () {
      const { sale, usdt, buyer1, buyer2 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      
      // Buyer1 makes 2 purchases
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * 2n);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Buyer2 makes 1 purchase
      await usdt.connect(buyer2).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer2).buyWithUSDT(usdtAmount, 0);

      const [amounts1] = await sale.getUserLocks(buyer1.address);
      const [amounts2] = await sale.getUserLocks(buyer2.address);

      expect(amounts1.length).to.equal(2);
      expect(amounts2.length).to.equal(1);
    });

    it("Should not allow user to claim another user's locks", async function () {
      const { sale, usdt, buyer1, buyer2 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      
      // Buyer1 makes purchase
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await time.increase(181 * 24 * 60 * 60);

      // Buyer1 should have 1 lock
      const [amounts1] = await sale.getUserLocks(buyer1.address);
      expect(amounts1.length).to.equal(1);

      // Buyer2 should have 0 locks
      const [amounts2] = await sale.getUserLocks(buyer2.address);
      expect(amounts2.length).to.equal(0);

      // Buyer2 cannot claim (has no locks)
      await expect(
        sale.connect(buyer2).claimAllUnlocked()
      ).to.be.revertedWith("no locks");
    });

    it("Should correctly track totalLocked across multiple users", async function () {
      const { sale, usdt, buyer1, buyer2 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Initial totalLocked
      expect(await sale.totalLocked()).to.equal(0);

      // Buyer1 purchases
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      expect(await sale.totalLocked()).to.equal(expectedECM);

      // Buyer2 purchases
      await usdt.connect(buyer2).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer2).buyWithUSDT(usdtAmount, expectedECM);
      expect(await sale.totalLocked()).to.equal(expectedECM * 2n);

      // Buyer1 claims
      await time.increase(181 * 24 * 60 * 60);
      await sale.connect(buyer1).claimAllUnlocked();
      expect(await sale.totalLocked()).to.equal(expectedECM); // Only buyer2's lock remains

      // Buyer2 claims
      await sale.connect(buyer2).claimAllUnlocked();
      expect(await sale.totalLocked()).to.equal(0);
    });
  });

  describe("Lock Array Management", function () {
    it("Should handle user with many locks", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("100", 6);
      const expectedECM = ethers.parseEther("200");
      const numLocks = 20;

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * BigInt(numLocks));

      // Create 20 locks
      for (let i = 0; i < numLocks; i++) {
        await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      }

      const [amounts, releaseTimes, claimed] = await sale.getUserLocks(buyer1.address);

      expect(amounts.length).to.equal(numLocks);
      expect(releaseTimes.length).to.equal(numLocks);
      expect(claimed.length).to.equal(numLocks);

      // Verify all are unclaimed
      for (let i = 0; i < numLocks; i++) {
        expect(amounts[i]).to.equal(expectedECM);
        expect(claimed[i]).to.be.false;
      }
    });

    it("Should correctly update totalLocked with many locks", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("100", 6);
      const expectedECM = ethers.parseEther("200");
      const numLocks = 10;

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * BigInt(numLocks));

      for (let i = 0; i < numLocks; i++) {
        await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
        
        // Check totalLocked increases correctly
        const expectedTotal = expectedECM * BigInt(i + 1);
        expect(await sale.totalLocked()).to.equal(expectedTotal);
      }
    });

    it("Should handle claiming subset of many locks", async function () {
      const { sale, usdt, ecmToken, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("100", 6);
      const expectedECM = ethers.parseEther("200");
      const numLocks = 10;

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount * BigInt(numLocks));

      for (let i = 0; i < numLocks; i++) {
        await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);
      }

      await time.increase(181 * 24 * 60 * 60);

      // Claim locks 2, 5, 8 (3 locks)
      await sale.connect(buyer1).claimLocks([2, 5, 8]);

      expect(await ecmToken.balanceOf(buyer1.address)).to.equal(expectedECM * 3n);

      const [, , claimed] = await sale.getUserLocks(buyer1.address);
      
      // Verify only specified locks are claimed
      for (let i = 0; i < numLocks; i++) {
        if (i === 2 || i === 5 || i === 8) {
          expect(claimed[i]).to.be.true;
        } else {
          expect(claimed[i]).to.be.false;
        }
      }
    });
  });
});
