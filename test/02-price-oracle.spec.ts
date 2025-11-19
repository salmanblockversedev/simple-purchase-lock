import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ECMSale - Price Oracle", function () {
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

    const ECMSaleFactory = await ethers.getContractFactory("ECMSale");
    const sale = await ECMSaleFactory.deploy(
      await ecmToken.getAddress(),
      await usdt.getAddress(),
      await pair.getAddress()
    );

    await ecmToken.transfer(await sale.getAddress(), ethers.parseEther("100000000"));
    await usdt.mint(buyer1.address, ethers.parseUnits("1000000", 6));

    return { ecmToken, usdt, pair, sale, owner, buyer1 };
  }

  describe("Reserve Ratio Tests", function () {
    it("Should calculate correct ECM for 1:1 ratio", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Set reserves: 1M USDT and 1M ECM (1 USDT = 1 ECM)
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),  // 1M USDT (6 decimals)
        ethers.parseEther("1000000")      // 1M ECM (18 decimals)
      );

      const usdtAmount = ethers.parseUnits("1000", 6); // 1000 USDT
      const expectedECM = ethers.parseEther("1000");   // 1000 ECM

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should calculate correct ECM for 1:2 ratio (ECM cheaper)", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Set reserves: 1M USDT and 2M ECM (1 USDT = 2 ECM)
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),  // 1M USDT
        ethers.parseEther("2000000")      // 2M ECM
      );

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should calculate correct ECM for 2:1 ratio (ECM expensive)", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Set reserves: 2M USDT and 1M ECM (1 USDT = 0.5 ECM)
      await pair.setReserves(
        ethers.parseUnits("2000000", 6),  // 2M USDT
        ethers.parseEther("1000000")      // 1M ECM
      );

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("500"); // 1000 * 1M / 2M = 500

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should calculate correct ECM for 1:100 ratio (very cheap ECM)", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Set reserves: 1M USDT and 100M ECM (1 USDT = 100 ECM)
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("100000000")
      );

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("100000"); // 1000 * 100M / 1M = 100k

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should calculate correct ECM for 100:1 ratio (very expensive ECM)", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Set reserves: 100M USDT and 1M ECM (1 USDT = 0.01 ECM)
      await pair.setReserves(
        ethers.parseUnits("100000000", 6),
        ethers.parseEther("1000000")
      );

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("10"); // 1000 * 1M / 100M = 10

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });
  });

  describe("Token Order Tests", function () {
    it("Should handle token0 = USDT, token1 = ECM correctly", async function () {
      const { usdt, ecmToken, sale } = await loadFixture(deployFixture);

      // Create pair with USDT as token0
      const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
      const pair = await MockPairFactory.deploy(
        await usdt.getAddress(),
        await ecmToken.getAddress()
      );

      // Set reserves: token0 (USDT) = 1M, token1 (ECM) = 2M
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("2000000")
      );

      // Update sale to use new pair
      await sale.setPair(await pair.getAddress());

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000");

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should handle token0 = ECM, token1 = USDT correctly", async function () {
      const { usdt, ecmToken, sale } = await loadFixture(deployFixture);

      // Create pair with ECM as token0 (reversed order)
      const MockPairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
      const pair = await MockPairFactory.deploy(
        await ecmToken.getAddress(),
        await usdt.getAddress()
      );

      // Set reserves: token0 (ECM) = 2M, token1 (USDT) = 1M
      await pair.setReserves(
        ethers.parseEther("2000000"),      // token0 (ECM)
        ethers.parseUnits("1000000", 6)    // token1 (USDT)
      );

      // Update sale to use new pair
      await sale.setPair(await pair.getAddress());

      const usdtAmount = ethers.parseUnits("1000", 6);
      const expectedECM = ethers.parseEther("2000"); // Same result regardless of order

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });
  });

  describe("Zero Reserve Handling", function () {
    it("Should revert when USDT reserve is zero", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      await pair.setReserves(
        0,                                // 0 USDT
        ethers.parseEther("1000000")      // 1M ECM
      );

      const usdtAmount = ethers.parseUnits("1000", 6);

      await expect(
        sale.getEstimatedECMForUSDT(usdtAmount)
      ).to.be.revertedWith("bad reserves");
    });

    it("Should revert when ECM reserve is zero", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      await pair.setReserves(
        ethers.parseUnits("1000000", 6),  // 1M USDT
        0                                  // 0 ECM
      );

      const usdtAmount = ethers.parseUnits("1000", 6);

      await expect(
        sale.getEstimatedECMForUSDT(usdtAmount)
      ).to.be.revertedWith("bad reserves");
    });

    it("Should revert when both reserves are zero", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      await pair.setReserves(0, 0);

      const usdtAmount = ethers.parseUnits("1000", 6);

      await expect(
        sale.getEstimatedECMForUSDT(usdtAmount)
      ).to.be.revertedWith("bad reserves");
    });
  });

  describe("Decimal Precision Tests", function () {
    it("Should handle 6 decimal USDT and 18 decimal ECM correctly", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Set realistic reserves
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),  // 1M USDT (6 decimals)
        ethers.parseEther("2000000")      // 2M ECM (18 decimals)
      );

      // Test with various USDT amounts
      const amounts = [
        { usdt: "1", ecm: "2" },
        { usdt: "100", ecm: "200" },
        { usdt: "1000", ecm: "2000" },
        { usdt: "10000", ecm: "20000" }
      ];

      for (const { usdt: usdtStr, ecm: ecmStr } of amounts) {
        const usdtAmount = ethers.parseUnits(usdtStr, 6);
        const expectedECM = ethers.parseEther(ecmStr);

        const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
        expect(estimate).to.equal(expectedECM);
      }
    });

    it("Should handle very small USDT amounts (wei-level precision)", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("2000000")
      );

      // Test with 1 unit of USDT (0.000001 USDT)
      // With 1M USDT (6 decimals) : 2M ECM (18 decimals) ratio
      // 1 USDT unit should get 2000000000000 wei of ECM (0.000002 ECM)
      const usdtAmount = 1n;
      
      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.be.gt(0n); // Should return some ECM
      expect(estimate).to.equal(2000000000000n); // Actual calculation result
    });

    it("Should handle very large amounts without overflow", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("2000000")
      );

      // Test with 500k USDT (large but reasonable)
      const usdtAmount = ethers.parseUnits("500000", 6);
      const expectedECM = ethers.parseEther("1000000"); // 1M ECM

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });
  });

  describe("Real-World Scenarios", function () {
    it("Should work with realistic market conditions (1 USDT = 0.5 ECM)", async function () {
      const { pair, sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Realistic reserves: 500k USDT and 250k ECM
      await pair.setReserves(
        ethers.parseUnits("500000", 6),
        ethers.parseEther("250000")
      );

      const usdtAmount = ethers.parseUnits("100", 6); // Buy with 100 USDT
      const expectedECM = ethers.parseEther("50");    // Should get 50 ECM

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);

      // Test actual purchase
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, expectedECM)
      ).to.not.be.reverted;
    });

    it("Should reflect price changes in reserves", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Initial: 1 USDT = 2 ECM
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("2000000")
      );

      const usdtAmount = ethers.parseUnits("1000", 6);
      const estimate1 = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate1).to.equal(ethers.parseEther("2000"));

      // Price changes: 1 USDT = 1 ECM (ECM becomes more expensive)
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("1000000")
      );

      const estimate2 = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate2).to.equal(ethers.parseEther("1000"));

      // Verify estimate decreased (ECM more expensive)
      expect(estimate2).to.be.lt(estimate1);
    });
  });

  describe("Extreme Reserve Ratios", function () {
    it("Should handle extremely low ECM price (1 USDT = 1000000 ECM)", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      await pair.setReserves(
        ethers.parseUnits("1000", 6),         // 1k USDT
        ethers.parseEther("1000000000")       // 1B ECM
      );

      const usdtAmount = ethers.parseUnits("1", 6); // 1 USDT
      const expectedECM = ethers.parseEther("1000000"); // 1M ECM

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should handle extremely high ECM price (1 USDT = 0.000001 ECM)", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      await pair.setReserves(
        ethers.parseUnits("1000000000", 6),  // 1B USDT
        ethers.parseEther("1000")             // 1k ECM
      );

      const usdtAmount = ethers.parseUnits("1000000", 6); // 1M USDT
      const expectedECM = ethers.parseEther("1"); // 1 ECM

      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.equal(expectedECM);
    });

    it("Should handle precision loss gracefully in extreme ratios", async function () {
      const { pair, sale } = await loadFixture(deployFixture);

      // Very high ECM price
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("1")
      );

      // Very small USDT amount
      const usdtAmount = ethers.parseUnits("0.01", 6);

      // Should return some amount (or 0 due to precision loss)
      const estimate = await sale.getEstimatedECMForUSDT(usdtAmount);
      expect(estimate).to.be.gte(0); // At least not revert
    });
  });

  describe("Integration with buyWithUSDT", function () {
    it("Should use correct price when purchasing", async function () {
      const { pair, sale, usdt, buyer1 } = await loadFixture(deployFixture);

      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("2000000")
      );

      const usdtAmount = ethers.parseUnits("1000", 6);
      const estimatedECM = await sale.getEstimatedECMForUSDT(usdtAmount);

      // Purchase with estimated amount as minimum
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await sale.connect(buyer1).buyWithUSDT(usdtAmount, estimatedECM);

      // Verify lock created with correct amount
      const [amounts] = await sale.getUserLocks(buyer1.address);
      expect(amounts[0]).to.equal(estimatedECM);
    });

    it("Should revert purchase when price moves unfavorably", async function () {
      const { pair, sale, usdt, buyer1 } = await loadFixture(deployFixture);

      // Initial reserves
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("2000000")
      );

      const usdtAmount = ethers.parseUnits("1000", 6);
      const estimatedECM = await sale.getEstimatedECMForUSDT(usdtAmount);

      // Price changes (ECM becomes more expensive)
      await pair.setReserves(
        ethers.parseUnits("1000000", 6),
        ethers.parseEther("1500000")
      );

      // Purchase should fail with old estimate as minECM
      await usdt.connect(buyer1).approve(await sale.getAddress(), usdtAmount);
      await expect(
        sale.connect(buyer1).buyWithUSDT(usdtAmount, estimatedECM)
      ).to.be.revertedWith("slippage");
    });
  });
});
