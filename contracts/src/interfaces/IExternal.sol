// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Chainlink AggregatorV3. Every Robinhood Chain stock token has one; the
///         feed already folds in the token's uiMultiplier, so never apply it twice.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice Uniswap V3 SwapRouter02 (no deadline field in the params struct).
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice ERC-8056 corporate-action multiplier exposed by genuine Robinhood stock tokens.
interface IStockToken {
    function uiMultiplier() external view returns (uint256);
}
