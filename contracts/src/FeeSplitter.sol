// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ISwapRouter02, IWETH} from "./interfaces/IExternal.sol";

/// @title FeeSplitter
/// @notice The one published rule. Creator fees from the WALK launch land here as ETH and
///         are split the same way every time: 50% to the map (DropVault), 40% to buy back
///         and burn WALK, 10% to the team. The split ratios and destinations are immutable.
///         `split()` is permissionless, so anyone can push the money along.
contract FeeSplitter is Ownable2Step, ReentrancyGuard {
    uint16 public constant MAP_BPS = 5_000;
    uint16 public constant BURN_BPS = 4_000;
    uint16 public constant TEAM_BPS = 1_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address payable public immutable vault;
    address payable public immutable team;
    IERC20 public immutable walk;
    IWETH public immutable weth;

    ISwapRouter02 public router;
    uint24 public poolFee;
    address public keeper;

    /// @notice ETH set aside for buyback that has not been swapped yet.
    uint256 public burnReserve;

    uint256 public totalToMap;
    uint256 public totalToTeam;
    uint256 public totalBurnEth;
    uint256 public totalWalkBurned;

    event Received(address indexed from, uint256 amount);
    event Split(uint256 toMap, uint256 toBurnReserve, uint256 toTeam);
    event Burned(uint256 ethIn, uint256 walkBurned);
    event RouterChanged(address router, uint24 poolFee);
    event KeeperChanged(address keeper);

    error NotKeeper();
    error NothingToSplit();
    error ZeroAddress();
    error EthTransferFailed();
    error OverReserve();

    constructor(address owner_, address payable vault_, address payable team_, IERC20 walk_, IWETH weth_, address keeper_)
        Ownable(owner_)
    {
        if (vault_ == address(0) || team_ == address(0) || address(walk_) == address(0) || address(weth_) == address(0)) {
            revert ZeroAddress();
        }
        vault = vault_;
        team = team_;
        walk = walk_;
        weth = weth_;
        keeper = keeper_;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function pending() public view returns (uint256) {
        return address(this).balance - burnReserve;
    }

    function split() external nonReentrant {
        uint256 amount = pending();
        if (amount == 0) revert NothingToSplit();
        uint256 toMap = (amount * MAP_BPS) / 10_000;
        uint256 toTeam = (amount * TEAM_BPS) / 10_000;
        uint256 toBurn = amount - toMap - toTeam; // rounding dust goes to the burn

        burnReserve += toBurn;
        totalToMap += toMap;
        totalToTeam += toTeam;

        _send(vault, toMap);
        _send(team, toTeam);
        emit Split(toMap, toBurn, toTeam);
    }

    /// @notice Buy WALK with reserved ETH and send it to the dead address.
    /// @param minOut the keeper quotes the pool off-chain and passes a floor, so a
    ///        sandwich reverts instead of filling.
    function buyAndBurn(uint256 ethIn, uint256 minOut) external nonReentrant returns (uint256 burned) {
        if (msg.sender != keeper && msg.sender != owner()) revert NotKeeper();
        if (ethIn == 0 || ethIn > burnReserve) revert OverReserve();
        burnReserve -= ethIn;

        weth.deposit{value: ethIn}();
        weth.approve(address(router), ethIn);
        burned = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: address(walk),
                fee: poolFee,
                recipient: DEAD,
                amountIn: ethIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        totalBurnEth += ethIn;
        totalWalkBurned += burned;
        emit Burned(ethIn, burned);
    }

    function setRouter(ISwapRouter02 router_, uint24 poolFee_) external onlyOwner {
        if (address(router_) == address(0)) revert ZeroAddress();
        router = router_;
        poolFee = poolFee_;
        emit RouterChanged(address(router_), poolFee_);
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperChanged(keeper_);
    }

    function _send(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }
}
