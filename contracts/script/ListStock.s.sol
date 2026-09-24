// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {DropVault} from "../src/DropVault.sol";
import {IAggregatorV3, IStockToken} from "../src/interfaces/IExternal.sol";

/// List one stock token on the vault. Run as the owner.
///
/// Robinhood's docs warn that many explorer contracts share a ticker; genuine stock
/// tokens implement ERC-8056 `uiMultiplier()`, copies do not. This script refuses to
/// list a token that fails that check or has the wrong decimals.
///
/// env: DROP_VAULT, STOCK, STOCK_FEED (Chainlink, from docs.chain.link robinhood page),
///      MAX_PER_CATCH, DAILY_CAP, LEGENDARY_MAX (raw units), POOL_FEE, HEARTBEAT
contract ListStock is Script {
    function run() external {
        DropVault vault = DropVault(payable(vm.envAddress("DROP_VAULT")));
        address stock = vm.envAddress("STOCK");
        IAggregatorV3 feed = IAggregatorV3(vm.envAddress("STOCK_FEED"));

        require(IERC20Metadata(stock).decimals() == 18, "stock tokens are 18 decimals");
        uint256 mult = IStockToken(stock).uiMultiplier(); // reverts on a copycat
        require(mult > 0, "uiMultiplier is zero");
        (, int256 price,, uint256 updatedAt,) = feed.latestRoundData();
        require(price > 0 && updatedAt > 0, "feed not live");

        console2.log("listing %s (%s)", IERC20Metadata(stock).symbol(), stock);
        console2.log("uiMultiplier %s, feed answer %s", mult, uint256(price));

        vm.startBroadcast();
        vault.configureStock(
            stock,
            DropVault.Stock({
                listed: true,
                poolFee: uint24(vm.envOr("POOL_FEE", uint256(3000))),
                heartbeat: uint32(vm.envOr("HEARTBEAT", uint256(4 days))),
                feed: feed,
                maxPerCatch: uint128(vm.envUint("MAX_PER_CATCH")),
                dailyCap: uint128(vm.envUint("DAILY_CAP")),
                legendaryMax: uint128(vm.envOr("LEGENDARY_MAX", uint256(1e18)))
            })
        );
        vm.stopBroadcast();
    }
}
