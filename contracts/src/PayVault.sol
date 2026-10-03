// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./SynclyVault.sol";
import {InvoiceBook} from "./InvoiceBook.sol";

/// @title PayVault: a business's bill money, which Syncly's CFO may spend only inside the owner's rules.
/// @notice A business (the owner's own wallet) deposits USDC and sets its rules: which suppliers may be paid
/// automatically, the most for one payment, and the most per week. The CFO's key can then pay a booked
/// InvoiceBook invoice from that balance, but only to an approved supplier, under both caps, and only once
/// (InvoiceBook refuses a second payment). Anything outside the rules can only be proposed; the owner
/// approves it from their wallet. The owner can withdraw at any time; the CFO has no way to move the money
/// anywhere except through `autopay`, to the invoice's fixed payee.
contract PayVault {
    struct Account {
        address owner;
        uint96 balance;
        uint96 perPayCap; // the most for one automatic payment
        uint96 weekCap; // the most per rolling week of automatic payments
        uint96 spent; // automatic payments this week
        uint64 weekStart;
    }

    IERC20 public immutable usdc;
    InvoiceBook public immutable book;
    address public agent; // Syncly's CFO key
    address public admin; // the Boss: can only rotate the agent key
    mapping(bytes32 => Account) public accounts; // business id → its account
    mapping(bytes32 => mapping(address => bool)) public allowed; // business → supplier → may be paid automatically
    mapping(bytes32 => mapping(bytes32 => bool)) public proposed; // business → invoice → waiting for the owner

    event Opened(bytes32 indexed biz, address indexed owner, uint256 perPayCap, uint256 weekCap);
    event Deposited(bytes32 indexed biz, address indexed from, uint256 amount);
    event Withdrawn(bytes32 indexed biz, address indexed to, uint256 amount);
    event LimitsSet(bytes32 indexed biz, uint256 perPayCap, uint256 weekCap);
    event PayeeSet(bytes32 indexed biz, address indexed payee, bool allowed);
    event Autopaid(bytes32 indexed biz, bytes32 indexed invoice, address indexed payee, uint256 amount, uint256 spentThisWeek);
    event Proposed(bytes32 indexed biz, bytes32 indexed invoice, address indexed payee, uint256 amount, string reason);
    event Approved(bytes32 indexed biz, bytes32 indexed invoice, address indexed payee, uint256 amount);
    event AgentSet(address agent);

    error NotOwner();
    error NotAgent();
    error NotAdmin();
    error Exists();
    error NoAccount();
    error UnknownInvoice();
    error AlreadyPaid();
    error IsCancelled();
    error PayeeNotAllowed();
    error OverPerPayCap();
    error OverWeekCap();
    error Insufficient();
    error TransferFailed();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier onlyOwner(bytes32 biz) {
        if (accounts[biz].owner == address(0)) revert NoAccount();
        if (msg.sender != accounts[biz].owner) revert NotOwner();
        _;
    }

    constructor(IERC20 usdc_, InvoiceBook book_, address agent_, address admin_) {
        usdc = usdc_;
        book = book_;
        agent = agent_;
        admin = admin_;
        emit AgentSet(agent_);
    }

    // ---------------------------------------------------------------- the owner

    /// Open the business's account with its rules. The caller's wallet becomes its owner.
    function open(bytes32 biz, uint96 perPayCap, uint96 weekCap, address[] calldata payees) external {
        if (accounts[biz].owner != address(0)) revert Exists();
        accounts[biz] = Account(msg.sender, 0, perPayCap, weekCap, 0, uint64(block.timestamp));
        emit Opened(biz, msg.sender, perPayCap, weekCap);
        for (uint256 i = 0; i < payees.length; i++) {
            allowed[biz][payees[i]] = true;
            emit PayeeSet(biz, payees[i], true);
        }
    }

    /// Add money for bills. Anyone may deposit to an account; only its owner can take it out.
    function deposit(bytes32 biz, uint96 amount) external {
        Account storage a = accounts[biz];
        if (a.owner == address(0)) revert NoAccount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        a.balance += amount;
        emit Deposited(biz, msg.sender, amount);
    }

    function withdraw(bytes32 biz, uint96 amount, address to) external onlyOwner(biz) {
        Account storage a = accounts[biz];
        if (amount > a.balance) revert Insufficient();
        a.balance -= amount;
        if (!usdc.transfer(to, amount)) revert TransferFailed();
        emit Withdrawn(biz, to, amount);
    }

    function setLimits(bytes32 biz, uint96 perPayCap, uint96 weekCap) external onlyOwner(biz) {
        accounts[biz].perPayCap = perPayCap;
        accounts[biz].weekCap = weekCap;
        emit LimitsSet(biz, perPayCap, weekCap);
    }

    function setPayee(bytes32 biz, address payee, bool ok) external onlyOwner(biz) {
        allowed[biz][payee] = ok;
        emit PayeeSet(biz, payee, ok);
    }

    /// The owner pays a proposed (or any booked) invoice from the account: their own decision, outside the caps.
    function approve(bytes32 biz, bytes32 invoice) external onlyOwner(biz) {
        Account storage a = accounts[biz];
        (address payee, uint96 amount) = _payable(invoice);
        if (amount > a.balance) revert Insufficient();
        a.balance -= amount;
        delete proposed[biz][invoice];
        _pay(invoice, amount);
        emit Approved(biz, invoice, payee, amount);
    }

    // ---------------------------------------------------------------- the CFO

    /// Pay a booked invoice automatically: an approved supplier, under both caps, from this business's balance.
    function autopay(bytes32 biz, bytes32 invoice) external onlyAgent {
        Account storage a = accounts[biz];
        if (a.owner == address(0)) revert NoAccount();
        (address payee, uint96 amount) = _payable(invoice);
        if (!allowed[biz][payee]) revert PayeeNotAllowed();
        if (amount > a.perPayCap) revert OverPerPayCap();
        if (block.timestamp >= a.weekStart + 7 days) {
            a.weekStart = uint64(block.timestamp);
            a.spent = 0;
        }
        if (uint256(a.spent) + amount > a.weekCap) revert OverWeekCap();
        if (amount > a.balance) revert Insufficient();
        a.balance -= amount;
        a.spent += amount;
        _pay(invoice, amount);
        emit Autopaid(biz, invoice, payee, amount, a.spent);
    }

    /// Outside the rules: the CFO can only ask. The owner sees it and decides.
    function propose(bytes32 biz, bytes32 invoice, string calldata reason) external onlyAgent {
        if (accounts[biz].owner == address(0)) revert NoAccount();
        (address payee, uint96 amount) = _payable(invoice);
        proposed[biz][invoice] = true;
        emit Proposed(biz, invoice, payee, amount, reason);
    }

    function setAgent(address agent_) external {
        if (msg.sender != admin) revert NotAdmin();
        agent = agent_;
        emit AgentSet(agent_);
    }

    // ---------------------------------------------------------------- internals

    function _payable(bytes32 invoice) internal view returns (address payee, uint96 amount) {
        bool paid;
        bool cancelled;
        (payee, amount,,,, paid, cancelled,) = book.invoices(invoice);
        if (payee == address(0)) revert UnknownInvoice();
        if (paid) revert AlreadyPaid();
        if (cancelled) revert IsCancelled();
    }

    /// InvoiceBook pulls exactly the invoice amount from this contract and sends it to the fixed payee.
    function _pay(bytes32 invoice, uint96 amount) internal {
        if (!usdc.approve(address(book), amount)) revert TransferFailed();
        book.pay(invoice);
    }
}
