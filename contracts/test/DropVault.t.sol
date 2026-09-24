// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DropVault} from "../src/DropVault.sol";
import {OracleLib} from "../src/libraries/OracleLib.sol";
import {IAggregatorV3, ISwapRouter02, IWETH} from "../src/interfaces/IExternal.sol";
import {MockStock, MockWETH, MockFeed, MockRouter} from "./Mocks.sol";

contract DropVaultTest is Test {
    DropVault vault;
    MockStock nvda;
    MockWETH weth;
    MockFeed ethUsd;
    MockFeed nvdaUsd;
    MockRouter router;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address walker = makeAddr("walker");

    function setUp() public {
        vm.warp(1_760_000_000);
        weth = new MockWETH();
        nvda = new MockStock("NVDA");
        ethUsd = new MockFeed(8, 4_000e8); // $4,000
        nvdaUsd = new MockFeed(8, 200e8); // $200 -> 20 NVDA per ETH
        router = new MockRouter(20e18);

        vault = new DropVault(owner, keeper, IWETH(address(weth)));
        vm.startPrank(owner);
        vault.configureStock(
            address(nvda),
            DropVault.Stock({
                listed: true,
                poolFee: 3000,
                heartbeat: 1 days,
                feed: IAggregatorV3(address(nvdaUsd)),
                maxPerCatch: 0.05e18,
                dailyCap: 0.1e18,
                legendaryMax: 1e18
            })
        );
        vault.setSwapConfig(ISwapRouter02(address(router)), IAggregatorV3(address(ethUsd)), 1 hours, IAggregatorV3(address(0)), 100);
        vm.stopPrank();
        nvda.mint(address(vault), 10e18);
    }

    function test_pay_transfersAndMarksPaid() public {
        vm.prank(keeper);
        vault.pay("drop-1", address(nvda), walker, 0.004e18);
        assertEq(nvda.balanceOf(walker), 0.004e18);
        assertTrue(vault.paid("drop-1"));
    }

    function test_pay_rejectsReplay() public {
        vm.startPrank(keeper);
        vault.pay("drop-1", address(nvda), walker, 0.004e18);
        vm.expectRevert(abi.encodeWithSelector(DropVault.AlreadyPaid.selector, bytes32("drop-1")));
        vault.pay("drop-1", address(nvda), walker, 0.004e18);
    }

    function test_pay_onlyKeeper() public {
        vm.expectRevert(DropVault.NotKeeper.selector);
        vault.pay("x", address(nvda), walker, 1);
    }

    function test_pay_perCatchCap() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DropVault.OverPerCatch.selector, 0.06e18, 0.05e18));
        vault.pay("x", address(nvda), walker, 0.06e18);
    }

    function test_pay_dailyCapResetsNextDay() public {
        vm.startPrank(keeper);
        vault.pay("a", address(nvda), walker, 0.05e18);
        vault.pay("b", address(nvda), walker, 0.05e18);
        vm.expectRevert(abi.encodeWithSelector(DropVault.OverDailyCap.selector, 0.101e18, 0.1e18));
        vault.pay("c", address(nvda), walker, 0.001e18);
        assertEq(vault.remainingToday(address(nvda)), 0);

        vm.warp(block.timestamp + 1 days);
        vault.pay("c", address(nvda), walker, 0.001e18);
        assertEq(vault.remainingToday(address(nvda)), 0.099e18);
    }

    function test_pay_unknownStock() public {
        MockStock fake = new MockStock("NVDA");
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DropVault.UnknownStock.selector, address(fake)));
        vault.pay("x", address(fake), walker, 1);
    }

    function test_pause_byKeeper_unpause_onlyOwner() public {
        vm.prank(keeper);
        vault.pause();
        vm.prank(keeper);
        vm.expectRevert();
        vault.pay("x", address(nvda), walker, 1);

        vm.prank(keeper);
        vm.expectRevert();
        vault.unpause();

        vm.prank(owner);
        vault.unpause();
        vm.prank(keeper);
        vault.pay("x", address(nvda), walker, 1);
    }

    function test_payBatch_isAtomic() public {
        bytes32[] memory ids = new bytes32[](2);
        address[] memory toks = new address[](2);
        address[] memory tos = new address[](2);
        uint256[] memory amts = new uint256[](2);
        ids[0] = "a";
        ids[1] = "b";
        toks[0] = toks[1] = address(nvda);
        tos[0] = tos[1] = walker;
        amts[0] = 0.01e18;
        amts[1] = 0.9e18; // over per-catch

        vm.prank(keeper);
        vm.expectRevert();
        vault.payBatch(ids, toks, tos, amts);
        assertFalse(vault.paid("a"));

        amts[1] = 0.01e18;
        vm.prank(keeper);
        vault.payBatch(ids, toks, tos, amts);
        assertEq(nvda.balanceOf(walker), 0.02e18);
    }

    function test_legendary_oncePerWeek() public {
        vm.startPrank(keeper);
        vault.payLegendary("leg-1", address(nvda), walker, 1e18);
        vm.expectRevert(DropVault.LegendaryThisWeek.selector);
        vault.payLegendary("leg-2", address(nvda), walker, 1e18);
        vm.warp(block.timestamp + 7 days);
        vault.payLegendary("leg-2", address(nvda), walker, 1e18);
        assertEq(nvda.balanceOf(walker), 2e18);
    }

    function test_buyStock_usesOracleFloor() public {
        vm.deal(address(vault), 1 ether);
        // fair = 20 NVDA, 1% slippage -> floor 19.8
        assertEq(vault.quoteMinOut(address(nvda), 1 ether), 19.8e18);
        vm.prank(keeper);
        uint256 out = vault.buyStock(address(nvda), 1 ether);
        assertEq(out, 20e18);
    }

    function test_buyStock_revertsWhenPoolIsWorseThanOracle() public {
        vm.deal(address(vault), 1 ether);
        router.setRate(19e18); // 5% worse than Chainlink: a sandwich
        vm.prank(keeper);
        vm.expectRevert("Too little received");
        vault.buyStock(address(nvda), 1 ether);
    }

    function test_buyStock_revertsOnStaleStockFeed() public {
        vm.deal(address(vault), 1 ether);
        nvdaUsd.set(200e8, block.timestamp - 2 days); // market closed for the weekend
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(OracleLib.StalePrice.selector, address(nvdaUsd), block.timestamp - 2 days));
        vault.buyStock(address(nvda), 1 ether);
    }

    function test_setSwapConfig_capsSlippage() public {
        vm.prank(owner);
        vm.expectRevert(DropVault.SlippageTooHigh.selector);
        vault.setSwapConfig(ISwapRouter02(address(router)), IAggregatorV3(address(ethUsd)), 1 hours, IAggregatorV3(address(0)), 501);
    }

    function testFuzz_neverPaysBeyondDailyCap(uint96[8] memory amounts) public {
        uint256 total;
        vm.startPrank(keeper);
        for (uint256 i; i < amounts.length; ++i) {
            uint256 a = bound(amounts[i], 1, 0.05e18);
            try vault.pay(bytes32(i + 1), address(nvda), walker, a) {
                total += a;
            } catch {}
        }
        assertLe(total, 0.1e18);
        assertEq(nvda.balanceOf(walker), total);
    }
}
