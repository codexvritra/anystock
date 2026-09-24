// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAggregatorV3, ISwapRouter02, IWETH} from "./interfaces/IExternal.sol";
import {OracleLib} from "./libraries/OracleLib.sol";

/// @title DropVault
/// @notice The public vault. It receives the map share of every creator fee, the keeper
///         turns that ETH into Robinhood Chain stock tokens, and every catch on the map
///         is a transfer out of here. Nothing is minted: a drop can only be paid from
///         stock the vault already holds.
///
///         The keeper is a hot key on the game server. It is deliberately weak:
///         - each payout is capped per stock (`maxPerCatch`)
///         - total payouts are capped per stock per UTC day (`dailyCap`)
///         - each drop id can be paid exactly once
///         - swaps are floored by a Chainlink-derived minimum, so a keeper cannot
///           be sandwiched into buying at a bad price
///         A leaked keeper key can therefore lose at most one day's budget, and the
///         guardian (owner or keeper) can pause instantly.
contract DropVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Stock {
        bool listed;
        uint24 poolFee; // Uniswap V3 fee tier for WETH/stock
        uint32 heartbeat; // max age of the stock feed, seconds
        IAggregatorV3 feed; // stock / USD
        uint128 maxPerCatch; // raw token units
        uint128 dailyCap; // raw token units per UTC day
        uint128 legendaryMax; // raw token units for the weekly legendary drop
    }

    struct Window {
        uint64 day;
        uint192 spent;
    }

    uint16 public constant MAX_SLIPPAGE_CAP_BPS = 500;

    IWETH public immutable weth;

    address public keeper;
    ISwapRouter02 public router;
    IAggregatorV3 public ethUsdFeed;
    uint32 public ethUsdHeartbeat;
    IAggregatorV3 public sequencerFeed;
    uint16 public maxSlippageBps = 100;

    mapping(address token => Stock) public stocks;
    mapping(address token => Window) public spentToday;
    mapping(bytes32 dropId => bool) public paid;
    uint64 public lastLegendaryWeek;
    address[] internal _stockList;

    event Funded(address indexed from, uint256 amount);
    event Caught(bytes32 indexed dropId, address indexed token, address indexed to, uint256 amount);
    event LegendaryCaught(bytes32 indexed dropId, address indexed token, address indexed to, uint256 amount);
    event StockBought(address indexed token, uint256 ethIn, uint256 amountOut, uint256 minOut);
    event StockConfigured(address indexed token, Stock config);
    event KeeperChanged(address indexed previous, address indexed next);
    event SwapConfigChanged(address router, address ethUsdFeed, uint32 heartbeat, address sequencerFeed, uint16 slippageBps);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error NotKeeper();
    error NotGuardian();
    error UnknownStock(address token);
    error AlreadyPaid(bytes32 dropId);
    error OverPerCatch(uint256 amount, uint256 max);
    error OverDailyCap(uint256 wouldSpend, uint256 cap);
    error LegendaryThisWeek();
    error ZeroAddress();
    error SlippageTooHigh();
    error InsufficientEth();
    error EthTransferFailed();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(address owner_, address keeper_, IWETH weth_) Ownable(owner_) {
        if (keeper_ == address(0) || address(weth_) == address(0)) revert ZeroAddress();
        keeper = keeper_;
        weth = weth_;
        emit KeeperChanged(address(0), keeper_);
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    // ───────────────────────────── catches ─────────────────────────────

    /// @notice Pay one catch. The server has already checked the walk; this checks the money.
    function pay(bytes32 dropId, address token, address to, uint256 amount)
        external
        onlyKeeper
        whenNotPaused
        nonReentrant
    {
        Stock storage s = _listed(token);
        if (amount > s.maxPerCatch) revert OverPerCatch(amount, s.maxPerCatch);
        _spend(dropId, token, s.dailyCap, amount);
        IERC20(token).safeTransfer(to, amount);
        emit Caught(dropId, token, to, amount);
    }

    /// @notice Pay a batch of catches in one transaction. Reverts atomically on any bad row,
    ///         so the server can fall back to paying rows one by one.
    function payBatch(bytes32[] calldata dropIds, address[] calldata tokens, address[] calldata tos, uint256[] calldata amounts)
        external
        onlyKeeper
        whenNotPaused
        nonReentrant
    {
        uint256 n = dropIds.length;
        require(tokens.length == n && tos.length == n && amounts.length == n, "length");
        for (uint256 i; i < n; ++i) {
            Stock storage s = _listed(tokens[i]);
            if (amounts[i] > s.maxPerCatch) revert OverPerCatch(amounts[i], s.maxPerCatch);
            _spend(dropIds[i], tokens[i], s.dailyCap, amounts[i]);
            IERC20(tokens[i]).safeTransfer(tos[i], amounts[i]);
            emit Caught(dropIds[i], tokens[i], tos[i], amounts[i]);
        }
    }

    /// @notice The weekly legendary: up to one full share, at most once per 7-day epoch.
    function payLegendary(bytes32 dropId, address token, address to, uint256 amount)
        external
        onlyKeeper
        whenNotPaused
        nonReentrant
    {
        Stock storage s = _listed(token);
        if (amount > s.legendaryMax) revert OverPerCatch(amount, s.legendaryMax);
        uint64 week = uint64(block.timestamp / 7 days);
        if (week == lastLegendaryWeek) revert LegendaryThisWeek();
        if (paid[dropId]) revert AlreadyPaid(dropId);
        paid[dropId] = true;
        lastLegendaryWeek = week;
        IERC20(token).safeTransfer(to, amount);
        emit LegendaryCaught(dropId, token, to, amount);
    }

    // ───────────────────────────── buying stock ─────────────────────────────

    /// @notice Turn vault ETH into a stock token through Uniswap V3, floored by Chainlink.
    function buyStock(address token, uint256 ethIn) external onlyKeeper whenNotPaused nonReentrant returns (uint256 out) {
        Stock storage s = _listed(token);
        if (ethIn == 0 || ethIn > address(this).balance) revert InsufficientEth();

        uint256 minOut = quoteMinOut(token, ethIn);
        weth.deposit{value: ethIn}();
        weth.approve(address(router), ethIn);
        out = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: token,
                fee: s.poolFee,
                recipient: address(this),
                amountIn: ethIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        emit StockBought(token, ethIn, out, minOut);
    }

    /// @notice The least amount of `token` the vault will accept for `ethIn` wei right now.
    function quoteMinOut(address token, uint256 ethIn) public view returns (uint256) {
        Stock storage s = _listed(token);
        OracleLib.checkSequencer(sequencerFeed);
        (uint256 ethUsd, uint8 ethDec) = OracleLib.read(ethUsdFeed, ethUsdHeartbeat);
        (uint256 stockUsd, uint8 stockDec) = OracleLib.read(s.feed, s.heartbeat);
        // stock tokens and WETH are both 18 decimals: out = ethIn * ethUsd / stockUsd, feed scales normalised.
        uint256 fair = (ethIn * ethUsd * (10 ** stockDec)) / (stockUsd * (10 ** ethDec));
        return (fair * (10_000 - maxSlippageBps)) / 10_000;
    }

    // ───────────────────────────── views ─────────────────────────────

    function stockList() external view returns (address[] memory) {
        return _stockList;
    }

    /// @notice What the keeper may still pay today for `token`.
    function remainingToday(address token) external view returns (uint256) {
        Stock storage s = stocks[token];
        Window memory w = spentToday[token];
        uint256 spent = w.day == _today() ? w.spent : 0;
        return s.dailyCap > spent ? s.dailyCap - spent : 0;
    }

    // ───────────────────────────── admin ─────────────────────────────

    function configureStock(address token, Stock calldata config) external onlyOwner {
        if (token == address(0) || address(config.feed) == address(0)) revert ZeroAddress();
        if (!stocks[token].listed && config.listed) _stockList.push(token);
        stocks[token] = config;
        emit StockConfigured(token, config);
    }

    function setKeeper(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit KeeperChanged(keeper, next);
        keeper = next;
    }

    function setSwapConfig(ISwapRouter02 router_, IAggregatorV3 ethUsd_, uint32 heartbeat_, IAggregatorV3 sequencer_, uint16 slippageBps_)
        external
        onlyOwner
    {
        if (address(router_) == address(0) || address(ethUsd_) == address(0)) revert ZeroAddress();
        if (slippageBps_ > MAX_SLIPPAGE_CAP_BPS) revert SlippageTooHigh();
        router = router_;
        ethUsdFeed = ethUsd_;
        ethUsdHeartbeat = heartbeat_;
        sequencerFeed = sequencer_;
        maxSlippageBps = slippageBps_;
        emit SwapConfigChanged(address(router_), address(ethUsd_), heartbeat_, address(sequencer_), slippageBps_);
    }

    /// @notice Either the owner or the keeper can stop the vault; only the owner restarts it.
    function pause() external {
        if (msg.sender != owner() && msg.sender != keeper) revert NotGuardian();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner withdrawal (migration, delisting). Public and evented, never silent.
    function withdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit Withdrawn(token, to, amount);
    }

    // ───────────────────────────── internals ─────────────────────────────

    function _listed(address token) internal view returns (Stock storage s) {
        s = stocks[token];
        if (!s.listed) revert UnknownStock(token);
    }

    function _spend(bytes32 dropId, address token, uint256 cap, uint256 amount) internal {
        if (paid[dropId]) revert AlreadyPaid(dropId);
        paid[dropId] = true;
        Window memory w = spentToday[token];
        uint64 today = _today();
        uint256 spent = (w.day == today ? w.spent : 0) + amount;
        if (spent > cap) revert OverDailyCap(spent, cap);
        spentToday[token] = Window({day: today, spent: uint192(spent)});
    }

    function _today() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }
}
