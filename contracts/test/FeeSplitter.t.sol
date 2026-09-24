// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";
import {ISwapRouter02, IWETH} from "../src/interfaces/IExternal.sol";
import {MockStock, MockWETH, MockRouter} from "./Mocks.sol";

contract FeeSplitterTest is Test {
    FeeSplitter splitter;
    MockWETH weth;
    MockStock walk; // mintable stand-in so the mock router can "buy" it
    MockRouter router;

    address owner = makeAddr("owner");
    address payable vault = payable(makeAddr("vault"));
    address payable team = payable(makeAddr("team"));
    address keeper = makeAddr("keeper");

    function setUp() public {
        weth = new MockWETH();
        walk = new MockStock("WALK");
        router = new MockRouter(1_000_000e18);
        splitter = new FeeSplitter(owner, vault, team, IERC20(address(walk)), IWETH(address(weth)), keeper);
        vm.prank(owner);
        splitter.setRouter(ISwapRouter02(address(router)), 10_000);
    }

    function test_split_isFiftyFortyTen() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(splitter).call{value: 10 ether}("");
        assertTrue(ok);

        splitter.split();
        assertEq(vault.balance, 5 ether);
        assertEq(team.balance, 1 ether);
        assertEq(splitter.burnReserve(), 4 ether);
        assertEq(splitter.pending(), 0);
    }

    function test_split_isPermissionless_andNeverTouchesReserve() public {
        vm.deal(address(splitter), 1 ether);
        vm.prank(makeAddr("anyone"));
        splitter.split();
        vm.deal(address(splitter), address(splitter).balance + 1 ether);
        splitter.split();
        assertEq(splitter.burnReserve(), 0.8 ether);
        assertEq(vault.balance, 1 ether);
    }

    function test_split_revertsWhenEmpty() public {
        vm.expectRevert(FeeSplitter.NothingToSplit.selector);
        splitter.split();
    }

    function test_buyAndBurn_sendsToDead() public {
        vm.deal(address(splitter), 1 ether);
        splitter.split();
        vm.prank(keeper);
        uint256 burned = splitter.buyAndBurn(0.4 ether, 1);
        assertEq(walk.balanceOf(splitter.DEAD()), burned);
        assertEq(splitter.totalWalkBurned(), burned);
        assertEq(splitter.burnReserve(), 0);
    }

    function test_buyAndBurn_onlyKeeperOrOwner_andBoundedByReserve() public {
        vm.deal(address(splitter), 1 ether);
        splitter.split();
        vm.expectRevert(FeeSplitter.NotKeeper.selector);
        splitter.buyAndBurn(0.1 ether, 0);
        vm.prank(keeper);
        vm.expectRevert(FeeSplitter.OverReserve.selector);
        splitter.buyAndBurn(0.5 ether, 0);
    }

    function testFuzz_splitConservesEth(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(address(splitter), amount);
        splitter.split();
        assertEq(vault.balance + team.balance + splitter.burnReserve(), amount);
    }
}
