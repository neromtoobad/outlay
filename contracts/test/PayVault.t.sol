// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "../src/SynclyVault.sol";
import {InvoiceBook} from "../src/InvoiceBook.sol";
import {PayVault} from "../src/PayVault.sol";
import {MockUSDC, Vm} from "./Syncly.t.sol";

interface VmTime {
    function warp(uint256) external;
}

contract PayVaultTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant U = 1e6;

    MockUSDC usdc;
    InvoiceBook book;
    PayVault vault;
    address boss = address(0xB055);
    address fees = address(0xFA17);
    address cfo = address(0xC1E2);
    address owner = address(0x0A11CE); // the business's own wallet
    address supplier = address(0x5099);
    address stranger = address(0xBAD);
    bytes32 biz = keccak256("biz_kemi");

    function setUp() public {
        usdc = new MockUSDC();
        book = new InvoiceBook(IERC20(address(usdc)), boss, fees, 50, cfo);
        vault = new PayVault(IERC20(address(usdc)), book, cfo, boss);
        usdc.mint(owner, 1_000 * U);
        address[] memory payees = new address[](1);
        payees[0] = supplier;
        vm.prank(owner);
        vault.open(biz, uint96(50 * U), uint96(80 * U), payees);
        vm.prank(owner);
        usdc.approve(address(vault), 200 * U);
        vm.prank(owner);
        vault.deposit(biz, uint96(200 * U));
    }

    function _bill(bytes32 id, address payee, uint256 amount) internal {
        vm.prank(cfo);
        book.book(id, payee, amount, 0, keccak256(abi.encode(id)));
    }

    function _balance() internal view returns (uint256 b) {
        (, b,,,,) = vault.accounts(biz);
    }

    function test_autopaysAnApprovedSupplierInsideTheCaps() public {
        _bill("b1", supplier, 40 * U);
        vm.prank(cfo);
        vault.autopay(biz, "b1");
        require(usdc.balanceOf(supplier) == 40 * U - 200_000, "supplier paid, minus the 0.5% fee");
        require(_balance() == 160 * U, "taken from this business's balance");
        require(usdc.balanceOf(address(vault)) == 160 * U, "the vault keeps the rest");
    }

    function test_cfoCantPayAnUnapprovedAddress() public {
        _bill("b1", stranger, 10 * U);
        vm.prank(cfo);
        vm.expectRevert(PayVault.PayeeNotAllowed.selector);
        vault.autopay(biz, "b1");
    }

    function test_perPaymentCap() public {
        _bill("b1", supplier, 51 * U);
        vm.prank(cfo);
        vm.expectRevert(PayVault.OverPerPayCap.selector);
        vault.autopay(biz, "b1");
    }

    function test_weeklyCapThenNextWeek() public {
        _bill("b1", supplier, 50 * U);
        _bill("b2", supplier, 40 * U);
        vm.prank(cfo);
        vault.autopay(biz, "b1");
        vm.prank(cfo);
        vm.expectRevert(PayVault.OverWeekCap.selector);
        vault.autopay(biz, "b2"); // 90 > the 80 weekly cap
        VmTime(address(vm)).warp(block.timestamp + 7 days);
        vm.prank(cfo);
        vault.autopay(biz, "b2"); // a new week
        require(_balance() == 110 * U, "both paid across two weeks");
    }

    function test_onlyTheCfoAutopays() public {
        _bill("b1", supplier, 10 * U);
        vm.prank(stranger);
        vm.expectRevert(PayVault.NotAgent.selector);
        vault.autopay(biz, "b1");
    }

    function test_noDoublePay() public {
        _bill("b1", supplier, 10 * U);
        vm.prank(cfo);
        vault.autopay(biz, "b1");
        vm.prank(cfo);
        vm.expectRevert(PayVault.AlreadyPaid.selector);
        vault.autopay(biz, "b1");
        require(_balance() == 190 * U, "paid once");
    }

    function test_outsideTheRulesTheCfoCanOnlyPropose() public {
        _bill("big", supplier, 120 * U);
        vm.prank(cfo);
        vault.propose(biz, "big", "over the 50 USDC per-payment cap");
        require(vault.proposed(biz, "big"), "waiting for the owner");
        require(_balance() == 200 * U, "nothing moved");
        vm.prank(owner);
        vault.approve(biz, "big");
        require(usdc.balanceOf(supplier) == 120 * U - 600_000, "the owner's approval pays it");
        require(!vault.proposed(biz, "big"), "no longer waiting");
    }

    function test_onlyTheOwnerApprovesAndWithdraws() public {
        _bill("big", supplier, 120 * U);
        vm.prank(cfo);
        vm.expectRevert(PayVault.NotOwner.selector);
        vault.approve(biz, "big");
        vm.prank(cfo);
        vm.expectRevert(PayVault.NotOwner.selector);
        vault.withdraw(biz, uint96(1 * U), cfo);
        vm.prank(owner);
        vault.withdraw(biz, uint96(200 * U), owner);
        require(usdc.balanceOf(owner) == 1_000 * U, "the owner can always take it all back");
    }

    function test_ownerSetsTheRules() public {
        vm.prank(cfo);
        vm.expectRevert(PayVault.NotOwner.selector);
        vault.setPayee(biz, stranger, true);
        vm.prank(cfo);
        vm.expectRevert(PayVault.NotOwner.selector);
        vault.setLimits(biz, uint96(1_000 * U), uint96(1_000 * U));
        vm.prank(owner);
        vault.setPayee(biz, supplier, false);
        _bill("b1", supplier, 10 * U);
        vm.prank(cfo);
        vm.expectRevert(PayVault.PayeeNotAllowed.selector);
        vault.autopay(biz, "b1");
    }

    function test_cantSpendMoreThanTheBusinessHas() public {
        vm.prank(owner);
        vault.withdraw(biz, uint96(195 * U), owner);
        _bill("b1", supplier, 10 * U);
        vm.prank(cfo);
        vm.expectRevert(PayVault.Insufficient.selector);
        vault.autopay(biz, "b1");
    }

    function test_oneBusinessCantSpendAnothersMoney() public {
        bytes32 other = keccak256("biz_other");
        address[] memory payees = new address[](1);
        payees[0] = supplier;
        vm.prank(stranger);
        vault.open(other, uint96(50 * U), uint96(80 * U), payees); // no deposit
        _bill("b1", supplier, 10 * U);
        vm.prank(cfo);
        vm.expectRevert(PayVault.Insufficient.selector);
        vault.autopay(other, "b1");
        require(_balance() == 200 * U, "the first business's money is untouched");
    }

    function test_accountCantBeTakenOver() public {
        address[] memory none = new address[](0);
        vm.prank(stranger);
        vm.expectRevert(PayVault.Exists.selector);
        vault.open(biz, uint96(1), uint96(1), none);
    }
}
