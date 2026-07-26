// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcKeys} from "../contracts/ArcKeys.sol";

/// @title DeployArcKeys
/// @notice Deploys ArcKeys.sol to Arc Testnet.
/// @dev Reads PRIVATE_KEY (required) and PROTOCOL_FEE_DESTINATION (optional,
///      defaults to the deployer address) from the environment / .env file.
contract DeployArcKeys is Script {
    function run() external returns (ArcKeys arcKeys) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Where the 5% protocol fee is sent. Defaults to the deployer.
        address protocolFeeDestination = vm.envOr("PROTOCOL_FEE_DESTINATION", deployer);

        console.log("Deployer:", deployer);
        console.log("Protocol fee destination:", protocolFeeDestination);

        vm.startBroadcast(deployerKey);
        arcKeys = new ArcKeys(protocolFeeDestination);
        vm.stopBroadcast();

        console.log("ArcKeys deployed at:", address(arcKeys));
        console.log("-> Set VITE_ARC_KEYS_CONTRACT_ADDRESS to this address in .env");
    }
}
