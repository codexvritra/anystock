// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAggregatorV3} from "../interfaces/IExternal.sol";

/// @notice Defensive Chainlink reads. Stock feeds only tick during market hours, so
///         each feed carries its own heartbeat; a stale read reverts and the keeper
///         simply retries once the market is open again.
library OracleLib {
    error StalePrice(address feed, uint256 updatedAt);
    error BadPrice(address feed, int256 answer);
    error SequencerDown();
    error SequencerGracePeriod();

    /// @dev Grace period after the L2 sequencer comes back, per Chainlink's L2 guidance.
    uint256 internal constant SEQUENCER_GRACE = 1 hours;

    function checkSequencer(IAggregatorV3 sequencerFeed) internal view {
        if (address(sequencerFeed) == address(0)) return;
        (, int256 answer, uint256 startedAt,,) = sequencerFeed.latestRoundData();
        if (answer != 0) revert SequencerDown();
        if (block.timestamp - startedAt <= SEQUENCER_GRACE) revert SequencerGracePeriod();
    }

    /// @return price the positive answer, scaled by the feed's own decimals
    /// @return decimals the feed's decimals
    function read(IAggregatorV3 feed, uint256 heartbeat) internal view returns (uint256 price, uint8 decimals) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer <= 0) revert BadPrice(address(feed), answer);
        if (updatedAt == 0 || block.timestamp - updatedAt > heartbeat) revert StalePrice(address(feed), updatedAt);
        return (uint256(answer), feed.decimals());
    }
}
