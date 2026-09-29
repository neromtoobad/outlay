// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// Circle Gateway wallet (Arc mainnet 0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE).
interface IGatewayWallet {
    function depositFor(address token, address depositor, uint256 value) external;
}

/// @title SynclyVault: the treasury of an AI-run company, in public.
/// @notice All USDC the company holds sits in one of five buckets. The AI CFO can move money
/// between buckets and fund agents' Gateway balances within the owner's policy, but it has no
/// function that sends money anywhere else. The owner (a human, "the Boss") co-signs anything
/// bigger. Customers' guarantees are always covered: BOND >= outstanding bonds.
contract SynclyVault {
    enum Bucket { OPERATING, TOOLS, BOND, RESERVE, PROMO }
    enum Kind { HIRE, FIRE, MOVE }

    struct Agent {
        bool active;
        uint64 allowanceEpoch;
        uint128 allowance; // max Gateway top-ups this epoch
        uint128 toppedUp; // sent to Gateway this epoch
    }

    struct Proposal {
        Kind kind;
        address who;
        Bucket from;
        Bucket to;
        uint256 amount;
        bytes32 reason;
        bool done;
    }

    IERC20 public immutable usdc;
    IGatewayWallet public immutable gateway;
    address public owner; // the Boss: human, browser wallet, outside the server's key set
    address public cfo; // the AI CFO's signer
    address public escrow; // JobEscrow

    uint256[5] public bucket; // USDC, 6 decimals
    uint256 public bondsOutstanding;
    mapping(bytes32 => uint256) public bondOf; // jobId => locked bond

    // policy (owner-set)
    uint256 public reserveFloor;
    uint256 public maxMove; // largest single move / payout the CFO may make alone
    uint256 public epochToolBudget; // cap on the sum of agent allowances per epoch
    uint256 public promoCapPerEpoch; // cap on free-job spend per epoch

    uint64 public epoch;
    uint256 public epochAllocated;
    uint256 public epochPromo;
    mapping(address => Agent) public agents;
    mapping(address => bool) public expert; // owner-approved human reviewers
    mapping(bytes32 => bool) public usedKey; // idempotency: keccak(docHash, payee, amount)
    Proposal[] public proposals;

    event Synced(uint256 credited);
    event Revenue(bytes32 indexed jobId, uint256 amount);
    event Moved(Bucket indexed from, Bucket indexed to, uint256 amount, bytes32 reason, bool cosigned);
    event EpochOpened(uint64 indexed epoch, bytes32 allocationCommit);
    event EpochClosed(uint64 indexed epoch, bytes32 recordHash);
    event AllowanceSet(address indexed agent, uint64 indexed epoch, uint256 amount);
    event TopUp(address indexed agent, uint64 indexed epoch, uint256 amount, bytes32 reason);
    event BondLocked(bytes32 indexed jobId, uint256 amount);
    event BondReleased(bytes32 indexed jobId, uint256 amount);
    event BondPaid(bytes32 indexed jobId, address indexed to, uint256 amount);
    event ExpertPaid(address indexed expert, bytes32 indexed jobId, uint256 amount, bytes32 docHash);
    event Proposed(uint256 indexed id, Kind kind, address who, uint256 amount, bytes32 reason);
    event CoSigned(uint256 indexed id);
    event AgentHired(address indexed agent);
    event AgentFired(address indexed agent);
    event ExpertSet(address indexed expert, bool approved);
    event PolicySet(uint256 reserveFloor, uint256 maxMove, uint256 epochToolBudget, uint256 promoCapPerEpoch);
    event OwnerWithdrew(Bucket indexed from, address indexed to, uint256 amount);

    error NotOwner();
    error NotCfo();
    error NotEscrow();
    error NeedsCoSign();
    error Insufficient(Bucket b);
    error ReserveFloor();
    error BondCoverage();
    error NotActive();
    error OverAllowance();
    error OverEpochBudget();
    error OverPromoCap();
    error NotExpert();
    error AlreadyPaid();
    error BadProposal();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    modifier onlyCfo() {
        if (msg.sender != cfo) revert NotCfo();
        _;
    }
    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow();
        _;
    }

    constructor(IERC20 usdc_, IGatewayWallet gateway_, address owner_, address cfo_) {
        usdc = usdc_;
        gateway = gateway_;
        owner = owner_;
        cfo = cfo_;
        epoch = 1;
    }

    // ----------------------------------------------------------------- views

    function balances() external view returns (uint256[5] memory) {
        return bucket;
    }

    function total() public view returns (uint256 t) {
        for (uint256 i; i < 5; i++) t += bucket[i];
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    // ----------------------------------------------------------------- money in

    /// Credit any USDC that arrived without a bucket (deposits, stray transfers) to OPERATING.
    function sync() public returns (uint256 credited) {
        uint256 bal = usdc.balanceOf(address(this));
        uint256 t = total();
        if (bal > t) {
            credited = bal - t;
            bucket[uint256(Bucket.OPERATING)] += credited;
            emit Synced(credited);
        }
    }

    /// Escrow released an accepted job's payment to the vault.
    function onRevenue(bytes32 jobId, uint256 amount) external onlyEscrow {
        sync();
        emit Revenue(jobId, amount);
    }

    // ----------------------------------------------------------------- CFO: buckets

    function move(Bucket from, Bucket to, uint256 amount, bytes32 reason) external onlyCfo {
        if (amount > maxMove) revert NeedsCoSign();
        _move(from, to, amount, reason, false);
    }

    function _move(Bucket from, Bucket to, uint256 amount, bytes32 reason, bool cosigned) internal {
        uint256 f = uint256(from);
        if (bucket[f] < amount) revert Insufficient(from);
        bucket[f] -= amount;
        bucket[uint256(to)] += amount;
        if (from == Bucket.RESERVE && bucket[f] < reserveFloor) revert ReserveFloor();
        if (from == Bucket.BOND && bucket[f] < bondsOutstanding) revert BondCoverage();
        emit Moved(from, to, amount, reason, cosigned);
    }

    /// Spend from PROMO (free first jobs) by moving it into TOOLS, capped per epoch.
    function promoToTools(uint256 amount, bytes32 jobId) external onlyCfo {
        if (epochPromo + amount > promoCapPerEpoch) revert OverPromoCap();
        epochPromo += amount;
        _move(Bucket.PROMO, Bucket.TOOLS, amount, jobId, false);
    }

    // ----------------------------------------------------------------- CFO: epochs & agents

    /// Open a new epoch. `allocationCommit` is the hash of the CFO's sealed allocation record;
    /// the full record (inputs, seed, reasoning) is published off-chain and must hash to it.
    function openEpoch(bytes32 allocationCommit) external onlyCfo {
        epoch += 1;
        epochAllocated = 0;
        epochPromo = 0;
        emit EpochOpened(epoch, allocationCommit);
    }

    function closeEpoch(bytes32 recordHash) external onlyCfo {
        emit EpochClosed(epoch, recordHash);
    }

    function setAllowance(address agent, uint128 amount) external onlyCfo {
        Agent storage a = agents[agent];
        if (!a.active) revert NotActive();
        if (a.allowanceEpoch != epoch) {
            a.allowanceEpoch = epoch;
            a.allowance = 0;
            a.toppedUp = 0;
        }
        if (amount < a.toppedUp) amount = a.toppedUp; // can't claw back money already sent to Gateway
        epochAllocated = epochAllocated - a.allowance + amount;
        if (epochAllocated > epochToolBudget) revert OverEpochBudget();
        a.allowance = amount;
        emit AllowanceSet(agent, epoch, amount);
    }

    /// Fund an agent's Circle Gateway balance so it can pay x402 vendors. Money leaves TOOLS and
    /// lands in Gateway under the agent's address; it can only be spent on signed x402 payments.
    function topUp(address agent, uint256 amount, bytes32 reason) external onlyCfo {
        Agent storage a = agents[agent];
        if (!a.active) revert NotActive();
        if (a.allowanceEpoch != epoch || a.toppedUp + amount > a.allowance) revert OverAllowance();
        uint256 t = uint256(Bucket.TOOLS);
        if (bucket[t] < amount) revert Insufficient(Bucket.TOOLS);
        bucket[t] -= amount;
        a.toppedUp += uint128(amount);
        usdc.approve(address(gateway), amount);
        gateway.depositFor(address(usdc), agent, amount);
        emit TopUp(agent, epoch, amount, reason);
    }

    /// Pay an owner-approved human reviewer from OPERATING. Idempotent per (doc, payee, amount).
    function payExpert(address to, uint256 amount, bytes32 jobId, bytes32 docHash) external onlyCfo {
        if (!expert[to]) revert NotExpert();
        if (amount > maxMove) revert NeedsCoSign();
        bytes32 key = keccak256(abi.encode(docHash, to, amount));
        if (usedKey[key]) revert AlreadyPaid();
        usedKey[key] = true;
        uint256 o = uint256(Bucket.OPERATING);
        if (bucket[o] < amount) revert Insufficient(Bucket.OPERATING);
        bucket[o] -= amount;
        require(usdc.transfer(to, amount), "transfer");
        emit ExpertPaid(to, jobId, amount, docHash);
    }

    // ----------------------------------------------------------------- CFO proposals → Boss

    function propose(Kind kind, address who, Bucket from, Bucket to, uint256 amount, bytes32 reason)
        external
        onlyCfo
        returns (uint256 id)
    {
        id = proposals.length;
        proposals.push(Proposal(kind, who, from, to, amount, reason, false));
        emit Proposed(id, kind, who, amount, reason);
    }

    function coSign(uint256 id) external onlyOwner {
        Proposal storage p = proposals[id];
        if (p.done) revert BadProposal();
        p.done = true;
        if (p.kind == Kind.HIRE) _hire(p.who);
        else if (p.kind == Kind.FIRE) _fire(p.who);
        else _move(p.from, p.to, p.amount, p.reason, true);
        emit CoSigned(id);
    }

    // ----------------------------------------------------------------- escrow hooks (bonds)

    function lockBond(bytes32 jobId, uint256 amount) external onlyEscrow {
        if (amount == 0) return;
        bondOf[jobId] = amount;
        bondsOutstanding += amount;
        if (bucket[uint256(Bucket.BOND)] < bondsOutstanding) revert BondCoverage();
        emit BondLocked(jobId, amount);
    }

    function releaseBond(bytes32 jobId) external onlyEscrow {
        uint256 b = bondOf[jobId];
        if (b == 0) return;
        bondOf[jobId] = 0;
        bondsOutstanding -= b;
        emit BondReleased(jobId, b);
    }

    function payBond(bytes32 jobId, address to) external onlyEscrow {
        uint256 b = bondOf[jobId];
        if (b == 0) return;
        bondOf[jobId] = 0;
        bondsOutstanding -= b;
        bucket[uint256(Bucket.BOND)] -= b;
        require(usdc.transfer(to, b), "transfer");
        emit BondPaid(jobId, to, b);
    }

    // ----------------------------------------------------------------- owner (the Boss)

    function hire(address agent) external onlyOwner {
        _hire(agent);
    }

    function fire(address agent) external onlyOwner {
        _fire(agent);
    }

    function _hire(address agent) internal {
        agents[agent].active = true;
        emit AgentHired(agent);
    }

    function _fire(address agent) internal {
        Agent storage a = agents[agent];
        a.active = false;
        if (a.allowanceEpoch == epoch) {
            // what was already sent still counts against this epoch's budget; nothing more can be sent
            epochAllocated = epochAllocated - a.allowance + a.toppedUp;
            a.allowance = a.toppedUp;
        }
        emit AgentFired(agent);
    }

    function setExpert(address who, bool approved) external onlyOwner {
        expert[who] = approved;
        emit ExpertSet(who, approved);
    }

    function setPolicy(uint256 reserveFloor_, uint256 maxMove_, uint256 epochToolBudget_, uint256 promoCap_)
        external
        onlyOwner
    {
        reserveFloor = reserveFloor_;
        maxMove = maxMove_;
        epochToolBudget = epochToolBudget_;
        promoCapPerEpoch = promoCap_;
        emit PolicySet(reserveFloor_, maxMove_, epochToolBudget_, promoCap_);
    }

    function setCfo(address cfo_) external onlyOwner {
        cfo = cfo_;
    }

    function setEscrow(address escrow_) external onlyOwner {
        escrow = escrow_;
    }

    function setOwner(address owner_) external onlyOwner {
        owner = owner_;
    }

    /// The owner can take money out of the company, but never the money backing customer bonds.
    function ownerWithdraw(Bucket from, address to, uint256 amount) external onlyOwner {
        uint256 f = uint256(from);
        if (bucket[f] < amount) revert Insufficient(from);
        bucket[f] -= amount;
        if (from == Bucket.BOND && bucket[f] < bondsOutstanding) revert BondCoverage();
        require(usdc.transfer(to, amount), "transfer");
        emit OwnerWithdrew(from, to, amount);
    }
}
