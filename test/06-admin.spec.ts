import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("ECMSale - Admin Functions", function () {
  async function deployFixture() {
    const [owner, buyer1, other] = await ethers.getSigners();

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

    const saleAllocation = ethers.parseEther("100000000");
    await ecmToken.transfer(await sale.getAddress(), saleAllocation);

    await usdt.mint(buyer1.address, ethers.parseUnits("100000", 6));

    return { ecmToken, usdt, pair, sale, owner, buyer1, other, saleAllocation };
  }

  describe("withdrawAvailableECM", function () {
    it("Should allow owner to withdraw available ECM", async function () {
      const { sale, ecmToken, owner, saleAllocation } = await loadFixture(deployFixture);

      const withdrawAmount = ethers.parseEther("1000000"); // 1M ECM

      await sale.connect(owner).withdrawAvailableECM(withdrawAmount);

      expect(await ecmToken.balanceOf(owner.address)).to.be.closeTo(
        ethers.parseEther("901000000"), // 900M (initial) + 1M (withdrawn)
        ethers.parseEther("1") // Allow small difference
      );
    });

    it("Should not allow withdrawing locked tokens", async function () {
      const { sale, usdt, owner, buyer1 } = await loadFixture(deployFixture);

      // Buyer purchases 2000 ECM
      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Try to withdraw all 100M (but 2000 ECM is locked)
      const withdrawAmount = ethers.parseEther("100000000");

      await expect(
        sale.connect(owner).withdrawAvailableECM(withdrawAmount)
      ).to.be.revertedWith("amount > available");

      // Should be able to withdraw available amount
      const available = await sale.availableECM();
      await expect(sale.connect(owner).withdrawAvailableECM(available)).to.not.be.reverted;
    });

    it("Should allow withdrawal after user claims", async function () {
      const { sale, usdt, ecmToken, owner, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      // Purchase
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM);

      // Available before claim
      const availableBefore = await sale.availableECM();

      // Fast forward and claim
      await time.increase(181 * 24 * 60 * 60);
      await sale.connect(buyer1).claimAllUnlocked();

      // Available after claim should be same (ECM left the contract)
      const availableAfter = await sale.availableECM();
      expect(availableAfter).to.equal(availableBefore);
    });

    it("Should revert when non-owner tries to withdraw", async function () {
      const { sale, other } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).withdrawAvailableECM(ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("Should emit WithdrawECM event", async function () {
      const { sale, owner } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1000");

      await expect(sale.connect(owner).withdrawAvailableECM(amount))
        .to.emit(sale, "WithdrawECM")
        .withArgs(owner.address, amount);
    });
  });

  describe("withdrawUSDT", function () {
    it("Should allow owner to withdraw USDT", async function () {
      const { sale, usdt, owner, buyer1 } = await loadFixture(deployFixture);

      // Buyer purchases with USDT
      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Owner withdraws USDT
      await sale.connect(owner).withdrawUSDT(usdtAmount);

      expect(await usdt.balanceOf(owner.address)).to.equal(usdtAmount);
      expect(await usdt.balanceOf(await sale.getAddress())).to.equal(0);
    });

    it("Should revert when amount exceeds balance", async function () {
      const { sale, owner } = await loadFixture(deployFixture);

      await expect(
        sale.connect(owner).withdrawUSDT(ethers.parseUnits("1000", 6))
      ).to.be.revertedWith("amount > balance");
    });

    it("Should revert when non-owner tries to withdraw", async function () {
      const { sale, other } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).withdrawUSDT(ethers.parseUnits("1000", 6))
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("Should emit WithdrawUSDT event", async function () {
      const { sale, usdt, owner, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      await expect(sale.connect(owner).withdrawUSDT(usdtAmount))
        .to.emit(sale, "WithdrawUSDT")
        .withArgs(owner.address, usdtAmount);
    });
  });

  describe("setPair", function () {
    it("Should allow owner to update pair", async function () {
      const { sale, owner, usdt, ecmToken } = await loadFixture(deployFixture);

      const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
      const newPair = await MockPairFactory.deploy(
        await usdt.getAddress(),
        await ecmToken.getAddress()
      );

      await sale.connect(owner).setPair(await newPair.getAddress());

      expect(await sale.pair()).to.equal(await newPair.getAddress());
    });

    it("Should emit PairUpdated event", async function () {
      const { sale, owner, usdt, ecmToken } = await loadFixture(deployFixture);

      const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
      const newPair = await MockPairFactory.deploy(
        await usdt.getAddress(),
        await ecmToken.getAddress()
      );

      await expect(sale.connect(owner).setPair(await newPair.getAddress()))
        .to.emit(sale, "PairUpdated")
        .withArgs(owner.address, await newPair.getAddress());
    });

    it("Should revert when non-owner tries to update", async function () {
      const { sale, other } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).setPair(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });
  });

  describe("setLockDuration", function () {
    it("Should allow owner to update lock duration", async function () {
      const { sale, owner } = await loadFixture(deployFixture);

      const newDuration = 90 * 24 * 60 * 60; // 90 days

      await sale.connect(owner).setLockDuration(newDuration);

      expect(await sale.lockDuration()).to.equal(newDuration);
    });

    it("Should emit LockDurationUpdated event", async function () {
      const { sale, owner } = await loadFixture(deployFixture);

      const newDuration = 90 * 24 * 60 * 60;

      await expect(sale.connect(owner).setLockDuration(newDuration))
        .to.emit(sale, "LockDurationUpdated")
        .withArgs(newDuration);
    });

    it("Should revert when non-owner tries to update", async function () {
      const { sale, other } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).setLockDuration(90 * 24 * 60 * 60)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });
  });

  describe("pause/unpause", function () {
    it("Should allow owner to pause", async function () {
      const { sale, owner } = await loadFixture(deployFixture);

      await sale.connect(owner).pause();

      expect(await sale.paused()).to.be.true;
    });

    it("Should allow owner to unpause", async function () {
      const { sale, owner } = await loadFixture(deployFixture);

      await sale.connect(owner).pause();
      await sale.connect(owner).unpause();

      expect(await sale.paused()).to.be.false;
    });

    it("Should prevent operations when paused", async function () {
      const { sale, usdt, buyer1, owner } = await loadFixture(deployFixture);

      await sale.connect(owner).pause();

      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, 0)
      ).to.be.revertedWithCustomError(sale, "EnforcedPause");
    });

    it("Should revert when non-owner tries to pause", async function () {
      const { sale, other } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).pause()
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });
  });
});
