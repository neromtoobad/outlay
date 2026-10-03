// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SynclyVault, IERC20, IGatewayWallet} from "../src/SynclyVault.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        emit Transfer(address(0), to, v);
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        emit Transfer(msg.sender, to, v);
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[t] += v;
        emit Transfer(f, t, v);
        return true;
    }
}

/// Mimics Circle's GatewayWallet.depositFor: pulls USDC from the caller, credits `depositor`.
contract MockGateway {
    MockUSDC public usdc;
    mapping(address => uint256) public balanceFor;

    constructor(MockUSDC u) {
        usdc = u;
    }

    function depositFor(address, address depositor, uint256 v) external {
        usdc.transferFrom(msg.sender, address(this), v);
        balanceFor[depositor] += v;
    }
}

contract SynclyTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant U = 1e6; // 1 USDC

    MockUSDC usdc;
    MockGateway gw;
    SynclyVault vault;
    JobEscrow esc;

    address boss = address(0xB055);
    address cfo = address(0xCF0);
    address operator = address(0x0BE);
    address customer = address(0xC0FFEE);
    address agent = address(0xA6E);
    address expertA = address(0xE4);
    address stranger = address(0xBAD);

    function setUp() public {
        usdc = new MockUSDC();
        gw = new MockGateway(usdc);
        vault = new SynclyVault(IERC20(address(usdc)), IGatewayWallet(address(gw)), boss, cfo);
        esc = new JobEscrow(IERC20(address(usdc)), vault, operator, boss);
        vm.startPrank(boss);
        vault.setEscrow(address(esc));
        vault.setPolicy({reserveFloor_: 2 * U, maxMove_: 3 * U, epochToolBudget_: 5 * U, promoCap_: 1 * U});
        vault.hire(agent);
        vault.setExpert(expertA, true);
        vm.stopPrank();
        // Fund the company with 20 USDC and split it across buckets
        usdc.mint(address(vault), 20 * U);
        vault.sync();
        vm.startPrank(cfo);
        vault.move(SynclyVault.Bucket.OPERATING, SynclyVault.Bucket.BOND, 3 * U, "bond pool");
        vault.move(SynclyVault.Bucket.OPERATING, SynclyVault.Bucket.RESERVE, 3 * U, "reserve");
        vault.move(SynclyVault.Bucket.OPERATING, SynclyVault.Bucket.TOOLS, 3 * U, "tools");
        vault.move(SynclyVault.Bucket.OPERATING, SynclyVault.Bucket.PROMO, 2 * U, "promo");
        vm.stopPrank();
        usdc.mint(customer, 50 * U);
    }

    function b(SynclyVault.Bucket x) internal view returns (uint256) {
        return vault.bucket(uint256(x));
    }

    function openFunded(bytes32 id, uint96 price, uint96 bond) internal {
        vm.prank(operator);
        esc.open(id, customer, price, bond, keccak256("spec"), uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days));
        vm.prank(customer);
        usdc.approve(address(esc), price);
        vm.prank(customer);
        esc.fund(id);
    }

    // ---------------------------------------------------------------- escrow

    function test_accept_pays_company_and_frees_bond() public {
        uint256 op0 = b(SynclyVault.Bucket.OPERATING);
        openFunded("j1", uint96(3 * U), uint96(6e5));
        require(vault.bondsOutstanding() == 6e5, "bond locked");
        vm.prank(operator);
        esc.submit("j1", keccak256("deliverable"));
        vm.prank(customer);
        esc.accept("j1");
        require(b(SynclyVault.Bucket.OPERATING) == op0 + 3 * U, "revenue to OPERATING");
        require(vault.bondsOutstanding() == 0, "bond released");
        require(vault.total() == usdc.balanceOf(address(vault)), "books == chain");
    }

    function test_reject_refunds_price_plus_bond() public {
        uint256 before = usdc.balanceOf(customer);
        uint256 bond0 = b(SynclyVault.Bucket.BOND);
        openFunded("j2", uint96(3 * U), uint96(6e5));
        vm.prank(operator);
        esc.submit("j2", keccak256("deliverable"));
        vm.prank(customer);
        esc.reject("j2");
        require(usdc.balanceOf(customer) == before + 6e5, "customer ends +bond");
        require(b(SynclyVault.Bucket.BOND) == bond0 - 6e5, "bond paid from BOND");
        require(vault.total() == usdc.balanceOf(address(vault)), "books == chain");
    }

    function test_silence_auto_releases_after_48h() public {
        openFunded("j3", uint96(2 * U), 0);
        vm.prank(operator);
        esc.submit("j3", keccak256("d"));
        vm.expectRevert(JobEscrow.TooEarly.selector);
        esc.autoRelease("j3");
        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(stranger);
        esc.autoRelease("j3");
    }

    function test_late_delivery_refunds_plus_bond() public {
        uint256 before = usdc.balanceOf(customer);
        openFunded("j4", uint96(3 * U), uint96(5e5));
        vm.warp(block.timestamp + 3 days);
        vm.prank(stranger);
        esc.refundLate("j4");
        require(usdc.balanceOf(customer) == before + 5e5, "refund + bond");
    }

    function test_operator_cannot_accept_its_own_work() public {
        openFunded("j5", uint96(3 * U), 0);
        vm.prank(operator);
        esc.submit("j5", keccak256("d"));
        vm.prank(operator);
        vm.expectRevert(JobEscrow.NotCustomer.selector);
        esc.accept("j5");
    }

    function test_one_revision_then_reject_still_pays_bond() public {
        openFunded("j6", uint96(3 * U), uint96(3e5));
        vm.prank(operator);
        esc.submit("j6", keccak256("v1"));
        vm.prank(customer);
        esc.requestRevision("j6");
        vm.prank(operator);
        esc.submit("j6", keccak256("v2"));
        vm.prank(customer);
        vm.expectRevert(JobEscrow.AlreadyRevised.selector);
        esc.requestRevision("j6");
        vm.prank(customer);
        esc.reject("j6");
    }

    function test_bond_must_be_covered_when_quoting() public {
        // BOND bucket holds 3 USDC; a 4 USDC bond cannot be quoted
        vm.prank(operator);
        vm.expectRevert(SynclyVault.BondCoverage.selector);
        esc.open("j7", customer, uint96(10 * U), uint96(4 * U), keccak256("s"), uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days));
    }

    // ---------------------------------------------------------------- CFO limits

    function test_cfo_cannot_drain_bond_below_outstanding() public {
        openFunded("j8", uint96(3 * U), uint96(2 * U));
        vm.prank(cfo);
        vm.expectRevert(SynclyVault.BondCoverage.selector);
        vault.move(SynclyVault.Bucket.BOND, SynclyVault.Bucket.OPERATING, 2 * U, "try");
    }

    function test_cfo_cannot_break_reserve_floor() public {
        vm.prank(cfo);
        vm.expectRevert(SynclyVault.ReserveFloor.selector);
        vault.move(SynclyVault.Bucket.RESERVE, SynclyVault.Bucket.TOOLS, 2 * U, "try"); // 3 → 1 < floor 2
    }

    function test_big_moves_need_the_boss() public {
        vm.prank(cfo);
        vm.expectRevert(SynclyVault.NeedsCoSign.selector);
        vault.move(SynclyVault.Bucket.OPERATING, SynclyVault.Bucket.TOOLS, 4 * U, "big");
        vm.prank(cfo);
        uint256 id = vault.propose(SynclyVault.Kind.MOVE, address(0), SynclyVault.Bucket.OPERATING, SynclyVault.Bucket.TOOLS, 4 * U, "big");
        vm.prank(cfo);
        vm.expectRevert(SynclyVault.NotOwner.selector);
        vault.coSign(id);
        vm.prank(boss);
        vault.coSign(id);
        require(b(SynclyVault.Bucket.TOOLS) == 7 * U, "moved after co-sign");
    }

    function test_cfo_has_no_withdraw_path() public {
        vm.prank(cfo);
        vm.expectRevert(SynclyVault.NotOwner.selector);
        vault.ownerWithdraw(SynclyVault.Bucket.OPERATING, cfo, 1 * U);
        vm.prank(cfo);
        vm.expectRevert(SynclyVault.NotOwner.selector);
        vault.fire(agent);
    }

    // ---------------------------------------------------------------- agents & Gateway

    function test_topup_goes_to_gateway_within_allowance() public {
        vm.startPrank(cfo);
        vault.setAllowance(agent, uint128(1 * U));
        vault.topUp(agent, 6e5, "scout budget");
        require(gw.balanceFor(agent) == 6e5, "credited in Gateway under the agent");
        vm.expectRevert(SynclyVault.OverAllowance.selector);
        vault.topUp(agent, 5e5, "too much");
        vm.expectRevert(SynclyVault.OverEpochBudget.selector);
        vault.setAllowance(agent, uint128(6 * U)); // epoch budget is 5
        vm.stopPrank();
        require(vault.total() == usdc.balanceOf(address(vault)), "books == chain");
    }

    function test_fired_agent_gets_nothing_more() public {
        vm.prank(cfo);
        vault.setAllowance(agent, uint128(1 * U));
        vm.prank(boss);
        vault.fire(agent);
        vm.prank(cfo);
        vm.expectRevert(SynclyVault.NotActive.selector);
        vault.topUp(agent, 1e5, "after firing");
    }

    function test_new_epoch_resets_allowances() public {
        vm.startPrank(cfo);
        vault.setAllowance(agent, uint128(1 * U));
        vault.topUp(agent, 1 * U, "e1");
        vault.openEpoch(keccak256("sealed allocation"));
        vm.expectRevert(SynclyVault.OverAllowance.selector);
        vault.topUp(agent, 1, "no allowance yet this epoch");
        vault.setAllowance(agent, uint128(1 * U));
        vault.topUp(agent, 1 * U, "e2");
        vm.stopPrank();
    }

    function test_promo_is_capped_per_epoch() public {
        vm.startPrank(cfo);
        vault.promoToTools(8e5, "free job 1");
        vm.expectRevert(SynclyVault.OverPromoCap.selector);
        vault.promoToTools(3e5, "free job 2");
        vm.stopPrank();
    }

    function test_expert_payout_is_idempotent_and_whitelisted() public {
        vm.startPrank(cfo);
        vault.payExpert(expertA, 1 * U, "j1", keccak256("review-j1"));
        vm.expectRevert(SynclyVault.AlreadyPaid.selector);
        vault.payExpert(expertA, 1 * U, "j1", keccak256("review-j1"));
        vm.expectRevert(SynclyVault.NotExpert.selector);
        vault.payExpert(stranger, 1 * U, "j1", keccak256("review-j1"));
        vm.stopPrank();
        require(usdc.balanceOf(expertA) == 1 * U, "expert paid once");
    }
}
