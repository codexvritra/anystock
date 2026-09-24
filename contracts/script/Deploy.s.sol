// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {WalkToken} from "../src/WalkToken.sol";
import {DropVault} from "../src/DropVault.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";
import {IWETH} from "../src/interfaces/IExternal.sol";

/// forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --verify
///
/// env: OWNER (multisig), KEEPER (server hot key), TEAM, WETH
///      WETH on Robinhood Chain mainnet per docs.robinhood.com/chain/contracts:
///      0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER");
        address keeper = vm.envAddress("KEEPER");
        address payable team = payable(vm.envAddress("TEAM"));
        IWETH weth = IWETH(vm.envAddress("WETH"));

        vm.startBroadcast();
        WalkToken walk = new WalkToken(owner);
        DropVault vault = new DropVault(owner, keeper, weth);
        FeeSplitter splitter = new FeeSplitter(owner, payable(address(vault)), team, IERC20(address(walk)), weth, keeper);
        vm.stopBroadcast();

        console2.log("WALK_TOKEN=%s", address(walk));
        console2.log("DROP_VAULT=%s", address(vault));
        console2.log("FEE_SPLITTER=%s", address(splitter));
    }
}
