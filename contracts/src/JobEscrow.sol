// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20, SynclyVault} from "./SynclyVault.sol";

/// @title JobEscrow: pay only for work you accept. If you don't accept it, you get your money back plus a bond.
/// @notice The customer is the evaluator. The operator (Syncly's server) can open and deliver
/// jobs but can never accept them. Payment releases only on the customer's acceptance, or on
/// silence after the acceptance window. A rejection, or a missed deadline, refunds the price and
/// pays the bond from the vault's BOND bucket.
contract JobEscrow {
    enum State { None, Open, Funded, Submitted, Accepted, Rejected, Refunded, Cancelled }

    struct Job {
        address customer;
        uint96 amount; // price, USDC 6 dp
        uint96 bond; // paid to the customer on rejection or late delivery
        uint64 fundBy;
        uint64 deliverBy;
        uint64 acceptBy;
        bool revised;
        State state;
        bytes32 specHash; // hash of the brief + acceptance criteria shown before payment
        bytes32 deliverableHash; // hash of the delivered file
    }

    IERC20 public immutable usdc;
    SynclyVault public immutable vault;
    address public operator;
    address public admin;
    uint64 public acceptWindow = 48 hours;
    uint64 public revisionWindow = 24 hours;
    mapping(bytes32 => Job) public jobs;

    event JobOpened(bytes32 indexed id, address indexed customer, uint256 amount, uint256 bond, bytes32 specHash, uint64 deliverBy);
    event JobFunded(bytes32 indexed id, address indexed payer, uint256 amount);
    event JobSubmitted(bytes32 indexed id, bytes32 deliverableHash, uint64 acceptBy);
    event RevisionRequested(bytes32 indexed id, uint64 deliverBy);
    event JobAccepted(bytes32 indexed id, bool auto_);
    event JobRejected(bytes32 indexed id, uint256 refund, uint256 bond);
    event JobRefundedLate(bytes32 indexed id, uint256 refund, uint256 bond);
    event JobCancelled(bytes32 indexed id);

    error NotOperator();
    error NotAdmin();
    error NotCustomer();
    error BadState(State s);
    error TooEarly();
    error TooLate();
    error Exists();
    error AlreadyRevised();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(IERC20 usdc_, SynclyVault vault_, address operator_, address admin_) {
        usdc = usdc_;
        vault = vault_;
        operator = operator_;
        admin = admin_;
    }

    function setOperator(address operator_) external {
        if (msg.sender != admin) revert NotAdmin();
        operator = operator_;
    }

    function setWindows(uint64 accept_, uint64 revision_) external {
        if (msg.sender != admin) revert NotAdmin();
        acceptWindow = accept_;
        revisionWindow = revision_;
    }

    /// Operator opens a quoted job. The bond is locked in the vault now, so every open quote is covered.
    function open(bytes32 id, address customer, uint96 amount, uint96 bond, bytes32 specHash, uint64 fundBy, uint64 deliverBy)
        external
        onlyOperator
    {
        if (jobs[id].state != State.None) revert Exists();
        jobs[id] = Job(customer, amount, bond, fundBy, deliverBy, 0, false, State.Open, specHash, bytes32(0));
        vault.lockBond(id, bond);
        emit JobOpened(id, customer, amount, bond, specHash, deliverBy);
    }

    /// Anyone may fund (the customer, or a wallet paying on their behalf). Pulls exactly `amount`.
    function fund(bytes32 id) external {
        Job storage j = jobs[id];
        if (j.state != State.Open) revert BadState(j.state);
        if (block.timestamp > j.fundBy) revert TooLate();
        j.state = State.Funded;
        require(usdc.transferFrom(msg.sender, address(this), j.amount), "transferFrom");
        emit JobFunded(id, msg.sender, j.amount);
    }

    /// An unfunded quote expires; its bond lock is released.
    function cancelUnfunded(bytes32 id) external {
        Job storage j = jobs[id];
        if (j.state != State.Open) revert BadState(j.state);
        if (block.timestamp <= j.fundBy && msg.sender != operator) revert TooEarly();
        j.state = State.Cancelled;
        vault.releaseBond(id);
        emit JobCancelled(id);
    }

    function submit(bytes32 id, bytes32 deliverableHash) external onlyOperator {
        Job storage j = jobs[id];
        if (j.state != State.Funded) revert BadState(j.state);
        if (block.timestamp > j.deliverBy) revert TooLate();
        j.state = State.Submitted;
        j.deliverableHash = deliverableHash;
        j.acceptBy = uint64(block.timestamp) + acceptWindow;
        emit JobSubmitted(id, deliverableHash, j.acceptBy);
    }

    function accept(bytes32 id) external {
        Job storage j = jobs[id];
        if (msg.sender != j.customer) revert NotCustomer();
        if (j.state != State.Submitted) revert BadState(j.state);
        _release(id, j, false);
    }

    /// Silence means yes: after the acceptance window anyone can release payment.
    function autoRelease(bytes32 id) external {
        Job storage j = jobs[id];
        if (j.state != State.Submitted) revert BadState(j.state);
        if (block.timestamp <= j.acceptBy) revert TooEarly();
        _release(id, j, true);
    }

    function requestRevision(bytes32 id) external {
        Job storage j = jobs[id];
        if (msg.sender != j.customer) revert NotCustomer();
        if (j.state != State.Submitted) revert BadState(j.state);
        if (j.revised) revert AlreadyRevised();
        if (block.timestamp > j.acceptBy) revert TooLate();
        j.revised = true;
        j.state = State.Funded;
        j.deliverBy = uint64(block.timestamp) + revisionWindow;
        emit RevisionRequested(id, j.deliverBy);
    }

    /// Not accepted: full refund plus the bond.
    function reject(bytes32 id) external {
        Job storage j = jobs[id];
        if (msg.sender != j.customer) revert NotCustomer();
        if (j.state != State.Submitted) revert BadState(j.state);
        if (block.timestamp > j.acceptBy) revert TooLate();
        j.state = State.Rejected;
        require(usdc.transfer(j.customer, j.amount), "transfer");
        vault.payBond(id, j.customer);
        emit JobRejected(id, j.amount, j.bond);
    }

    /// Syncly missed its deadline: full refund plus the bond, claimable by anyone for the customer.
    function refundLate(bytes32 id) external {
        Job storage j = jobs[id];
        if (j.state != State.Funded) revert BadState(j.state);
        if (block.timestamp <= j.deliverBy) revert TooEarly();
        j.state = State.Refunded;
        require(usdc.transfer(j.customer, j.amount), "transfer");
        vault.payBond(id, j.customer);
        emit JobRefundedLate(id, j.amount, j.bond);
    }

    function _release(bytes32 id, Job storage j, bool auto_) internal {
        j.state = State.Accepted;
        require(usdc.transfer(address(vault), j.amount), "transfer");
        vault.onRevenue(id, j.amount);
        vault.releaseBond(id);
        emit JobAccepted(id, auto_);
    }
}
