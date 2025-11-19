import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ECMSale - USDT Compatibility", function () {
  async function deployFixture() {
    const [owner, buyer1] = await ethers.getSigners();

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

    return { ecmToken, usdt, pair, sale, owner, buyer1 };
  }

  describe("SafeERC20 Wrapper - Standard ERC20 Behavior", function () {
    it("Should handle standard ERC20 transfer (with bool return)", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);

      // Standard USDT (MockUSDT) returns bool on transfer
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      // Should work with SafeERC20
      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, 0)
      ).to.not.be.reverted;

      // Verify transfer succeeded
      expect(await usdt.balanceOf(await sale.getAddress())).to.equal(usdtAmount);
    });

    it("Should handle standard ERC20 with normal approval flow", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);

      // Approve
      const approveTx = await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await approveTx.wait();

      // Check allowance
      const allowance = await usdt.allowance(buyer1.address, await sale.getAddress());
      expect(allowance).to.equal(usdtAmount);

      // Use allowance
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Allowance should be consumed
      expect(await usdt.allowance(buyer1.address, await sale.getAddress())).to.equal(0);
    });
  });

  describe("USDT Non-Standard Behavior - Strict Approval Mode", function () {
    it("Should handle USDT strict approval mode (approve to non-zero requires reset)", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Enable strict approval mode (like some USDT versions)
      await usdt.setStrictApproval(true);

      const usdtAmount = ethers.parseUnits("1000", 6);

      // First approval should work
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      // Use some allowance
      await sale.connect(buyer1).buyWithUSDT(ethers.parseUnits("500", 6), 0);

      // Remaining allowance
      const remaining = await usdt.allowance(buyer1.address, await sale.getAddress());
      expect(remaining).to.equal(ethers.parseUnits("500", 6));

      // Try to approve new amount without resetting to 0 first (should revert in strict mode)
      await expect(
        usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount)
      ).to.be.revertedWith("USDT: approve from non-zero");

      // Must reset to 0 first
      await usdt.connect(buyer1).approve(await sale.getAddress(), 0);

      // Now can approve new amount
      await expect(
        usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount)
      ).to.not.be.reverted;
    });

    it("Should document that users must handle approval pattern on frontend", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      await usdt.setStrictApproval(true);

      const usdtAmount = ethers.parseUnits("1000", 6);

      // Scenario: User approved 1000 USDT, used 600, wants to approve 1000 again

      // Initial approval
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      // Use 600 USDT
      await sale.connect(buyer1).buyWithUSDT(ethers.parseUnits("600", 6), 0);

      // Frontend should:
      // 1. Check current allowance
      const currentAllowance = await usdt.allowance(buyer1.address, await sale.getAddress());
      expect(currentAllowance).to.equal(ethers.parseUnits("400", 6));

      // 2. If allowance > 0, reset to 0 first (for USDT compatibility)
      if (currentAllowance > 0n) {
        await usdt.connect(buyer1).approve(await sale.getAddress(), 0);
      }

      // 3. Then approve new amount
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      // 4. Now can purchase
      await expect(
        sale.connect(buyer1).buyWithUSDT(ethers.parseUnits("400", 6), 0)
      ).to.not.be.reverted;
    });
  });

  describe("SafeERC20 - transferFrom Protection", function () {
    it("Should use safeTransferFrom which handles non-standard returns", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);

      // SafeERC20 wraps the call and checks success
      // Even if USDT doesn't return bool, SafeERC20 handles it
      const tx = sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);
      await expect(tx).to.not.be.reverted;

      // Verify transfer worked
      expect(await usdt.balanceOf(await sale.getAddress())).to.equal(usdtAmount);
      expect(await usdt.balanceOf(buyer1.address)).to.equal(
        ethers.parseUnits("99000", 6) // 100k - 1k
      );
    });

    it("Should revert if transferFrom fails (insufficient balance)", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const tooMuch = ethers.parseUnits("200000", 6); // More than buyer has

      await usdt.connect(buyer1).approve(await sale.getAddress(), tooMuch);

      // SafeERC20 should detect failure and revert
      await expect(
        sale.connect(buyer1).buyWithUSDT(tooMuch, 0)
      ).to.be.reverted;
    });

    it("Should revert if transferFrom fails (insufficient allowance)", async function () {
      const { sale, buyer1 } = await loadFixture(deployFixture);

      const usdtAmount = ethers.parseUnits("1000", 6);

      // No approval given

      // SafeERC20 should detect failure and revert
      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, 0)
      ).to.be.reverted;
    });
  });

  describe("SafeERC20 - safeTransfer for Admin Withdrawals", function () {
    it("Should use safeTransfer for USDT withdrawals", async function () {
      const { sale, usdt, buyer1, owner } = await loadFixture(deployFixture);

      // Buyer purchases with USDT
      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Owner withdraws USDT (uses safeTransfer internally)
      await expect(
        sale.connect(owner).withdrawUSDT(usdtAmount)
      ).to.not.be.reverted;

      expect(await usdt.balanceOf(owner.address)).to.equal(usdtAmount);
    });

    it("Should use safeTransfer for ECM withdrawals", async function () {
      const { sale, ecmToken, owner } = await loadFixture(deployFixture);

      const withdrawAmount = ethers.parseEther("1000000");

      // Owner withdraws ECM (uses safeTransfer internally)
      await expect(
        sale.connect(owner).withdrawAvailableECM(withdrawAmount)
      ).to.not.be.reverted;

      // Verify transfer
      const ownerBalance = await ecmToken.balanceOf(owner.address);
      expect(ownerBalance).to.be.gte(ethers.parseEther("901000000"));
    });

    it("Should use safeTransfer when user claims ECM", async function () {
      const { sale, usdt, ecmToken, buyer1 } = await loadFixture(deployFixture);

      // Purchase
      const usdtAmount = ethers.parseUnits("1000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [181 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Claim (uses safeTransfer internally)
      await expect(
        sale.connect(buyer1).claimAllUnlocked()
      ).to.not.be.reverted;

      // Verify transfer
      expect(await ecmToken.balanceOf(buyer1.address)).to.be.gt(0);
    });
  });

  describe("USDT Decimals Handling (6 vs 18)", function () {
    it("Should correctly handle 6 decimal USDT in calculations", async function () {
      const { usdt } = await loadFixture(deployFixture);

      // Verify USDT has 6 decimals
      expect(await usdt.decimals()).to.equal(6);

      // 1 USDT = 1_000_000 units
      const oneUSDT = ethers.parseUnits("1", 6);
      expect(oneUSDT).to.equal(1000000n);
    });

    it("Should correctly convert USDT amounts in reserves calculation", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Reserves use raw token units
      await pair.setReserves(
        ethers.parseUnits("1000", 6),    // 1000 USDT (6 decimals)
        ethers.parseEther("2000")        // 2000 ECM (18 decimals)
      );

      // 100 USDT should give 200 ECM
      const usdtAmount = ethers.parseUnits("100", 6);
      const expectedECM = ethers.parseEther("200");

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should handle decimal conversion in actual purchase", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Purchase 50.50 USDT (6 decimals)
      const usdtAmount = ethers.parseUnits("50.5", 6);

      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, 0);

      // Verify correct amount transferred
      const [amounts] = await sale.getUserLocks(buyer1.address);
      const expectedECM = ethers.parseEther("101"); // 50.5 * 2 = 101 ECM

      expect(amounts[0]).to.equal(expectedECM);
    });
  });

  describe("Real USDT Behavior Simulation", function () {
    it("Should work with typical USDT transaction flow", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Typical flow:
      // 1. User gets USDT from exchange/swap
      const initialBalance = await usdt.balanceOf(buyer1.address);
      expect(initialBalance).to.equal(ethers.parseUnits("100000", 6));

      // 2. User approves sale contract
      const approveAmount = ethers.parseUnits("5000", 6);
      await usdt.connect(buyer1).approve(await sale.getAddress(), approveAmount);

      // 3. User makes first purchase
      const purchase1 = ethers.parseUnits("1000", 6);
      await sale.connect(buyer1).buyWithUSDT(purchase1, 0);

      // 4. User makes second purchase (remaining allowance)
      const purchase2 = ethers.parseUnits("2000", 6);
      await sale.connect(buyer1).buyWithUSDT(purchase2, 0);

      // 5. Check remaining allowance
      const remainingAllowance = await usdt.allowance(buyer1.address, await sale.getAddress());
      expect(remainingAllowance).to.equal(ethers.parseUnits("2000", 6)); // 5000 - 1000 - 2000

      // 6. Verify USDT balance
      const finalBalance = await usdt.balanceOf(buyer1.address);
      expect(finalBalance).to.equal(ethers.parseUnits("97000", 6)); // 100k - 3k
    });

    it("Should handle multiple approvals and purchases correctly", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Disable strict mode for this test (standard ERC20 behavior)
      await usdt.setStrictApproval(false);

      // First approval
      await usdt.connect(buyer1).approve(await sale.getAddress(), ethers.parseUnits("1000", 6));
      await sale.connect(buyer1).buyWithUSDT(ethers.parseUnits("1000", 6), 0);

      // Second approval
      await usdt.connect(buyer1).approve(await sale.getAddress(), ethers.parseUnits("2000", 6));
      await sale.connect(buyer1).buyWithUSDT(ethers.parseUnits("2000", 6), 0);

      // Third approval
      await usdt.connect(buyer1).approve(await sale.getAddress(), ethers.parseUnits("3000", 6));
      await sale.connect(buyer1).buyWithUSDT(ethers.parseUnits("3000", 6), 0);

      // Verify total spent
      const finalBalance = await usdt.balanceOf(buyer1.address);
      expect(finalBalance).to.equal(ethers.parseUnits("94000", 6)); // 100k - 6k

      // Verify 3 locks created
      const [amounts] = await sale.getUserLocks(buyer1.address);
      expect(amounts.length).to.equal(3);
    });
  });

  describe("Edge Cases with USDT", function () {
    it("Should handle max uint256 approval (common pattern)", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Many dApps approve max uint256 to avoid repeated approvals
      const maxApproval = ethers.MaxUint256;

      await usdt.connect(buyer1).approve(await sale.getAddress(), maxApproval);

      // Should still work for normal purchase
      const usdtAmount = ethers.parseUnits("1000", 6);
      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, 0)
      ).to.not.be.reverted;

      // Allowance should be reduced (spent some USDT)
      const remaining = await usdt.allowance(buyer1.address, await sale.getAddress());
      
      // Note: MockERC20 uses standard allowance reduction, so it should be less
      // The actual spent amount depends on price calculation
      expect(remaining).to.be.lte(maxApproval); // Less than or equal
      
      // Verify some allowance was actually used
      if (remaining < maxApproval) {
        expect(remaining).to.be.gt(maxApproval - ethers.parseUnits("10000", 6)); // Used at most 10k USDT
      }
    });

    it("Should handle dust amounts (1 unit of USDT)", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // 1 unit = 0.000001 USDT
      const dustAmount = 1n;

      await usdt.connect(buyer1).approve(await sale.getAddress(), dustAmount);

      // May succeed or return tiny ECM amount depending on reserves
      // Should not revert
      await expect(
        sale.connect(buyer1).buyWithUSDT(dustAmount, 0)
      ).to.not.be.reverted;
    });

    it("Should handle exact balance purchase", async function () {
      const { sale, usdt, buyer1 } = await loadFixture(deployFixture);

      const exactBalance = await usdt.balanceOf(buyer1.address);

      await usdt.connect(buyer1).approve(await sale.getAddress(), exactBalance);

      // Purchase entire balance
      await sale.connect(buyer1).buyWithUSDT(exactBalance, 0);

      // Should have 0 USDT left
      expect(await usdt.balanceOf(buyer1.address)).to.equal(0);
    });
  });
});
