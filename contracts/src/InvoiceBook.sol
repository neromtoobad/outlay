// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./SynclyVault.sol";

/// @title InvoiceBook: invoices a business is paid on, exactly once, to the payee it named.
/// @notice Syncly Pay books a business's invoices here: the ones it sends its customers, and the bills it
/// pays its suppliers. When an invoice is booked, its payee, exact amount and the hash of the invoice
/// document are fixed, so the four errors in "Agents and Ledgers" can't happen through it:
///  - wrong payee: a changed pay link can't redirect the money; it only ever goes to the booked payee
///  - double pay: an invoice is paid at most once
///  - phantom invoice: every payment points to a document hash fixed before the money moved
///  - rounding: amounts are whole USDC units (6 dp), paid exactly; the fee is floored, in the payee's favour
/// Money goes straight from the payer to the payee in the same call; this contract never holds it. A small
/// fee, fixed per invoice when it is booked and capped at 1%, goes to Syncly's vault.
contract InvoiceBook {
    struct Invoice {
        address payee; // who gets paid
        uint96 amount; // USDC, 6 dp
        address booker; // the Syncly key that booked it
        uint64 due; // unix time, informational
        uint16 feeBps; // fixed when booked
        bool paid;
        bool cancelled;
        bytes32 docHash; // keccak256 of the invoice document (the business, the customer, the lines)
    }

    uint16 public constant MAX_FEE_BPS = 100; // 1%

    IERC20 public immutable usdc;
    address public owner; // the Boss: sets the fee and who may book
    address public feeTo; // Syncly's vault
    uint16 public feeBps;
    mapping(address => bool) public booker; // Syncly's server keys that verify a business before booking
    mapping(bytes32 => Invoice) public invoices;

    event Booked(bytes32 indexed id, address indexed payee, uint256 amount, uint64 due, bytes32 docHash, uint16 feeBps);
    event Paid(bytes32 indexed id, address indexed payer, address indexed payee, uint256 amount, uint256 fee);
    event Cancelled(bytes32 indexed id);
    event FeeSet(uint16 feeBps, address feeTo);
    event BookerSet(address who, bool allowed);
    event OwnerSet(address owner);

    error NotOwner();
    error NotBooker();
    error Exists();
    error Unknown();
    error AlreadyPaid();
    error IsCancelled();
    error BadInvoice();
    error FeeTooHigh();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IERC20 usdc_, address owner_, address feeTo_, uint16 feeBps_, address booker_) {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        usdc = usdc_;
        owner = owner_;
        feeTo = feeTo_;
        feeBps = feeBps_;
        booker[booker_] = true;
        emit OwnerSet(owner_);
        emit FeeSet(feeBps_, feeTo_);
        emit BookerSet(booker_, true);
    }

    /// Book an invoice. Only a Syncly booker, after it has checked the business behind the payee.
    function book(bytes32 id, address payee, uint256 amount, uint64 due, bytes32 docHash) external {
        if (!booker[msg.sender]) revert NotBooker();
        if (invoices[id].payee != address(0)) revert Exists();
        if (payee == address(0) || amount == 0 || amount > type(uint96).max || docHash == bytes32(0)) revert BadInvoice();
        invoices[id] = Invoice(payee, uint96(amount), msg.sender, due, feeBps, false, false, docHash);
        emit Booked(id, payee, amount, due, docHash, feeBps);
    }

    /// Pay an invoice in full, once. The payer approves `amount` USDC to this contract first.
    function pay(bytes32 id) external {
        Invoice storage inv = invoices[id];
        if (inv.payee == address(0)) revert Unknown();
        if (inv.paid) revert AlreadyPaid();
        if (inv.cancelled) revert IsCancelled();
        inv.paid = true; // before the transfers: a re-entrant call finds it paid
        uint256 fee = (uint256(inv.amount) * inv.feeBps) / 10_000;
        if (!usdc.transferFrom(msg.sender, inv.payee, inv.amount - fee)) revert TransferFailed();
        if (fee > 0 && !usdc.transferFrom(msg.sender, feeTo, fee)) revert TransferFailed();
        emit Paid(id, msg.sender, inv.payee, inv.amount, fee);
    }

    /// Withdraw an unpaid invoice (the business asked, or a check failed). Its booker or the owner.
    function cancel(bytes32 id) external {
        Invoice storage inv = invoices[id];
        if (inv.payee == address(0)) revert Unknown();
        if (msg.sender != inv.booker && msg.sender != owner) revert NotBooker();
        if (inv.paid) revert AlreadyPaid();
        inv.cancelled = true;
        emit Cancelled(id);
    }

    function setFee(uint16 feeBps_, address feeTo_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        feeTo = feeTo_;
        emit FeeSet(feeBps_, feeTo_);
    }

    function setBooker(address who, bool allowed) external onlyOwner {
        booker[who] = allowed;
        emit BookerSet(who, allowed);
    }

    function setOwner(address owner_) external onlyOwner {
        owner = owner_;
        emit OwnerSet(owner_);
    }
}
