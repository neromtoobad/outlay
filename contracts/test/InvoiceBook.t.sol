// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "../src/SynclyVault.sol";
import {InvoiceBook} from "../src/InvoiceBook.sol";
import {MockUSDC, Vm} from "./Syncly.t.sol";

contract InvoiceBookTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant U = 1e6;

    MockUSDC usdc;
    InvoiceBook book;
    address boss = address(0xB055);
    address vault = address(0xFA17);
    address clerk = address(0xC1E2);
    address shop = address(0x5409); // the business being paid
    address buyer = address(0xB0B);
    bytes32 doc = keccak256("invoice #1: 2 party trays");

    function setUp() public {
        usdc = new MockUSDC();
        book = new InvoiceBook(IERC20(address(usdc)), boss, vault, 50, clerk); // 0.5%
        usdc.mint(buyer, 1_000 * U);
    }

    function _book(bytes32 id, uint256 amount) internal {
        vm.prank(clerk);
        book.book(id, shop, amount, uint64(block.timestamp + 3 days), doc);
    }

    function _pay(bytes32 id, uint256 approve_) internal {
        vm.prank(buyer);
        usdc.approve(address(book), approve_);
        vm.prank(buyer);
        book.pay(id);
    }

    function test_paysPayeeAndFeeExactly() public {
        _book("inv1", 50 * U);
        _pay("inv1", 50 * U);
        require(usdc.balanceOf(shop) == 50 * U - 250_000, "payee gets amount minus 0.5%");
        require(usdc.balanceOf(vault) == 250_000, "vault gets the fee");
        require(usdc.balanceOf(buyer) == 950 * U, "buyer pays the amount, no more");
        require(usdc.balanceOf(address(book)) == 0, "the book never holds money");
    }

    function test_noDoublePay() public {
        _book("inv1", 10 * U);
        _pay("inv1", 20 * U);
        vm.prank(buyer);
        vm.expectRevert(InvoiceBook.AlreadyPaid.selector);
        book.pay("inv1");
        require(usdc.balanceOf(shop) + usdc.balanceOf(vault) == 10 * U, "paid exactly once");
    }

    function test_onlyBookerBooks() public {
        vm.prank(buyer);
        vm.expectRevert(InvoiceBook.NotBooker.selector);
        book.book("x", buyer, 1 * U, 0, doc); // a scammer can't book an invoice paying themselves
    }

    function test_idCantBeRebooked() public {
        _book("inv1", 10 * U);
        vm.prank(clerk);
        vm.expectRevert(InvoiceBook.Exists.selector);
        book.book("inv1", buyer, 10 * U, 0, doc); // the payee of a booked invoice can't be swapped
    }

    function test_needsADocument() public {
        vm.prank(clerk);
        vm.expectRevert(InvoiceBook.BadInvoice.selector);
        book.book("inv1", shop, 10 * U, 0, bytes32(0));
    }

    function test_cancelledCantBePaid() public {
        _book("inv1", 10 * U);
        vm.prank(clerk);
        book.cancel("inv1");
        vm.prank(buyer);
        usdc.approve(address(book), 10 * U);
        vm.prank(buyer);
        vm.expectRevert(InvoiceBook.IsCancelled.selector);
        book.pay("inv1");
    }

    function test_paidCantBeCancelled() public {
        _book("inv1", 10 * U);
        _pay("inv1", 10 * U);
        vm.prank(clerk);
        vm.expectRevert(InvoiceBook.AlreadyPaid.selector);
        book.cancel("inv1");
    }

    function test_strangerCantCancel() public {
        _book("inv1", 10 * U);
        vm.prank(buyer);
        vm.expectRevert(InvoiceBook.NotBooker.selector);
        book.cancel("inv1");
    }

    function test_feeIsFixedWhenBooked() public {
        _book("inv1", 100 * U);
        vm.prank(boss);
        book.setFee(100, vault); // raised to 1% after booking
        _pay("inv1", 100 * U);
        require(usdc.balanceOf(vault) == 500_000, "the invoice keeps the 0.5% it was booked with");
    }

    function test_feeCappedAtOnePercent() public {
        vm.prank(boss);
        vm.expectRevert(InvoiceBook.FeeTooHigh.selector);
        book.setFee(101, vault);
    }

    function test_onlyOwnerSetsFeeAndBookers() public {
        vm.prank(clerk);
        vm.expectRevert(InvoiceBook.NotOwner.selector);
        book.setFee(10, clerk);
        vm.prank(clerk);
        vm.expectRevert(InvoiceBook.NotOwner.selector);
        book.setBooker(buyer, true);
    }

    function test_tinyAmountRoundsInPayeesFavour() public {
        _book("inv1", 199); // 0.000199 USDC: the 0.5% fee floors to 0
        _pay("inv1", 199);
        require(usdc.balanceOf(shop) == 199, "payee gets it all");
        require(usdc.balanceOf(vault) == 0, "no fee below one unit");
    }

    function test_unknownInvoice() public {
        vm.prank(buyer);
        vm.expectRevert(InvoiceBook.Unknown.selector);
        book.pay("nope");
    }

    function test_shortAllowanceMovesNothing() public {
        _book("inv1", 10 * U);
        vm.prank(buyer);
        usdc.approve(address(book), 5 * U);
        vm.prank(buyer);
        vm.expectRevert();
        book.pay("inv1");
        require(usdc.balanceOf(shop) == 0, "nothing paid");
        (,,,,, bool paid,,) = book.invoices("inv1");
        require(!paid, "still unpaid");
    }
}
