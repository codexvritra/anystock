// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title WALK
/// @notice Fixed supply. There is no mint function and no owner: what exists at
///         deployment is all that will ever exist, and burns only shrink it.
contract WalkToken is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor(address recipient) ERC20("Streetstock", "WALK") ERC20Permit("Streetstock") {
        _mint(recipient, TOTAL_SUPPLY);
    }
}
