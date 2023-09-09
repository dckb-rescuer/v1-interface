import React, { useReducer } from "react";
import useSWRImmutable from 'swr/immutable'
import { Cell, Header, Hexadecimal, OutPoint, Script } from "@ckb-lumos/base";
import { Uint128LE, Uint64LE } from "@ckb-lumos/codec/lib/number/uint";
import { BI, BIish } from "@ckb-lumos/bi";
import { computeScriptHash } from "@ckb-lumos/base/lib/utils";
import { hexify } from "@ckb-lumos/codec/lib/bytes";
import { encodeToAddress } from "@ckb-lumos/helpers";
import { calculateDaoEarliestSinceCompatible, calculateMaximumWithdrawCompatible } from "@ckb-lumos/common-scripts/lib/dao";
import { processRPCRequests } from "./rpc_request_batcher";
import { Epoch, defaultScript, epochCompare, parseEpoch, stringifyEpoch } from "./utils";
import { mutatorAccumulator, useCollector, useRPC } from "./fetcher";
import { TransactionBuilder } from "./domain_logic";
import { signer } from "./pw_lock_signer";

export function Body(props: { ethereumAddress: Hexadecimal }) {
    const { ethereumAddress } = props;
    const accountLock = { ...defaultScript("PW_LOCK"), args: ethereumAddress };
    const address = encodeToAddress(accountLock);

    const mutator = mutatorAccumulator();

    const [deadCells, dispatchDeadCells] = useReducer(reducer, new ImmutableSet<Cell>(c => `${c.outPoint!.txHash}-${c.outPoint!.index}`));

    const capacities = useCollector(mutator, { type: undefined, lock: accountLock, withData: true });

    const sudts = useCollector(mutator, { type: defaultScript("SUDT"), lock: accountLock });

    const totalCapacitiesValue = sum(capacities.map(c => c.cellOutput.capacity));
    const totalSudtsValue = sum(sudts.map(c => Uint128LE.unpack(c.data)));

    const receipts = [
        ...useCollector(mutator, { type: defaultScript("DAO_INFO"), lock: accountLock }),
        ...useCollector(mutator, {
            type: defaultScript("DAO_INFO"),
            lock: { ...defaultScript("INFO_DAO_LOCK_V2"), args: computeScriptHash(accountLock) }
        })
    ];
    const deposits = receipts.map(receipt2Deposit);

    const withdrawalRequests = useCollector(mutator, { type: defaultScript("DAO"), lock: accountLock });

    const daos = [...deposits, ...withdrawalRequests];

    const actionInfos = [] as {
        type: "request" | "withdrawal";
        value: BI;
        since: Epoch;
        action: () => Promise<void>;
        disabled: boolean;
        cell: Cell,
    }[];
    const tipHeader = useRPC<Header>(mutator, "getTipHeader");
    const feeRate = useFeeRate(mutator);
    for (const i of Array.from({ length: 1000 }).keys()) {
        const [h1, h2] = (
            i < daos.length ? [
                daos[i].blockNumber!,
                Uint64LE.unpack(daos[i].data).toHexString()
            ].map(b => `rpc/getHeaderByNumber/${b}`) :
                [null, null]
        ).map(
            // eslint-disable-next-line react-hooks/rules-of-hooks
            rpcCalls => useSWRImmutable<Header>(rpcCalls).data
        );

        if (!h1 || !h2 || !tipHeader || !feeRate) {
            continue;
        }

        const inputs: Cell[] = [];
        const builder = new TransactionBuilder(accountLock, signer, [h1, h2], feeRate);
        const action = async () => {
            dispatchDeadCells({ type: "add", cells: inputs });
            try {
                await builder.buildAndSend();
                mutator();
            } catch (err) {
                console.log(err);
                dispatchDeadCells({ type: "remove", cells: inputs });
            }
        };

        if (i < deposits.length) {// Handle withdrawal request action
            const deposit = deposits[i];
            const receipt = receipts[i];
            const withdrawal = {
                cellOutput: {
                    capacity: deposit.cellOutput.capacity,
                    lock: accountLock,
                    type: defaultScript("DAO")
                },
                data: hexify(Uint64LE.pack(BI.from(deposit.blockNumber)))
            };

            inputs.push(deposit, receipt, ...sudts);
            builder.add("input", "end", ...inputs).add("output", "end", withdrawal);

            //Last epoch withdrawals should be at the end of the actions list as transaction may not be included in time
            let tipEpoch = parseEpoch(tipHeader.epoch);
            const tipEpochPlusOne = stringifyEpoch({ ...tipEpoch, number: tipEpoch.number.add(1) })

            actionInfos.push({
                type: "request",
                value: calculateMaximumWithdrawCompatible(deposit, h1.dao, tipHeader.dao)
                    .add(receipt.cellOutput.capacity),
                since: parseEpoch(calculateDaoEarliestSinceCompatible(h1.epoch, tipEpochPlusOne)),
                action,
                disabled: deadCells.hasAny(...inputs) ? true : totalSudtsValue.lt(deposit.cellOutput.capacity) ? true : false,
                cell: deposit,
            });
        } else {// Handle withdrawal action
            const withdrawalRequest = daos[i];
            inputs.push(withdrawalRequest);
            builder.add("input", "end", ...inputs);

            const since = parseEpoch(calculateDaoEarliestSinceCompatible(h2.epoch, h1.epoch))

            actionInfos.push({
                type: "withdrawal",
                value: calculateMaximumWithdrawCompatible(withdrawalRequest, h2.dao, h1.dao),
                since,
                action,
                disabled: deadCells.hasAny(...inputs) ? true : epochCompare(since, parseEpoch(tipHeader.epoch)) === -1 ? false : true,
                cell: withdrawalRequest,
            });
        }
    }

    actionInfos.sort((a, b) => epochCompare(a.since, b.since));

    const totalDepositedValue = sum(actionInfos.filter(i => i.type === "request").map(i => i.value));
    const totalWithdrawableValue = sum(actionInfos.filter(i => i.type === "withdrawal").map(i => i.value));

    try {
        if (!tipHeader || !feeRate) {
            return (
                <>
                    <h1>dCKB Rescuer</h1>
                    <h2>Account information</h2>
                    <ul>
                        <li>Ethereum Address: <a href={`https://etherscan.io/address/${ethereumAddress}`}>{ethereumAddress}</a></li>
                        <li>Nervos Address(PW): <a href={`https://explorer.nervos.org/address/${address}`}>{midElide(address, ethereumAddress.length)}</a></li>
                    </ul>
                    <h2>Loading dCKB Actions...</h2>
                    <p>Downloading the latest dCKB data, just for you. Hang tight...</p>
                    <p><div className="spinner spin"></div></p>
                </>
            );
        }

        return (
            <>
                <h1>dCKB Rescuer</h1>
                <h2>Account information</h2>
                <ul>
                    <li>Ethereum Address: <a href={`https://etherscan.io/address/${ethereumAddress}`}>{ethereumAddress}</a></li>
                    <li>Nervos Address(PW): <a href={`https://explorer.nervos.org/address/${address}`}>{midElide(address, ethereumAddress.length)}</a></li>
                    <li>Available Balance: {display(totalCapacitiesValue)} CKB & {display(totalSudtsValue)} dCKB</li>
                    {deposits.length > 0 ?
                        <>
                            <li>{deposits.length} Deposit{deposits.length > 1 ? "s" : ""} with {display(totalDepositedValue)} CKB locked</li>
                            <li>Amount required to unlock all deposits: {display(sum(deposits.map(c => c.cellOutput.capacity)))} dCKB</li>
                        </>
                        : <li>No Deposits found</li>
                    }
                    <li>{withdrawalRequests.length > 0 ? `${withdrawalRequests.length} Pending Withdrawal${withdrawalRequests.length > 1 ? "s" : ""} with ${display(totalWithdrawableValue)} CKB locked` : "No Pending Withdrawals found"}</li>
                </ul >
                <h2>dCKB Actions</h2>
                {actionInfos.length > 0 ?
                    <div>
                        {actionInfos.map(
                            ({ type, value, since, action, disabled, cell }) =>
                                <button key={cell.outPoint!.txHash} className="fit" onClick={action} disabled={disabled}>
                                    {type === "request" ?
                                        `Burn ${display(BI.from(cell.cellOutput.capacity))} dCKB to unlock a ${display(value)} CKB Deposit` :
                                        `Complete Withdrawal of ${display(value)} CKB Deposit`}
                                </button>
                        )}
                    </div>
                    :
                    <p>No actions available, nothing to do here! 😎</p>
                }
                {deadCells.hasAny(...capacities, ...sudts, ...daos, ...receipts) ? <p><div className="spinner spin"></div></p> : null}
            </>
        );
    } finally {
        processRPCRequests();
    }
}

function useFeeRate(mutator: () => void) {
    type FeeRateStatistics = { mean: Hexadecimal, median: Hexadecimal };
    const feeRateStatistics6 = useRPC<FeeRateStatistics | null>(mutator, "getFeeRateStatistics", "0x6");
    const feeRateStatistics101 = useRPC<FeeRateStatistics | null>(mutator, "getFeeRateStatistics", "0x101");
    if (feeRateStatistics6 === undefined || feeRateStatistics101 === undefined) {
        return undefined;
    }

    const median101 = feeRateStatistics101 === null ? BI.from(1000) : BI.from(feeRateStatistics101.median);
    const median6 = feeRateStatistics6 === null ? median101 : BI.from(feeRateStatistics6.median);

    let res = median6.add(median6.div(10));

    const lowerLimit = median101.add(median101.div(10));
    const upperLimit = BI.from(10 ** 7)

    if (res.lt(lowerLimit)) {
        res = lowerLimit;
    } else if (res.gt(upperLimit)) {
        res = upperLimit;
    }
    return res;
}

function reducer(state: ImmutableSet<Cell>, action: { type: "add" | "remove", cells: Cell[] }) {
    switch (action.type) {
        case 'add': {
            return state.union(...action.cells);
        }
        case 'remove': {
            return state.difference(...action.cells);
        }
    }
    throw Error('Unknown action: ' + action.type);
}

class ImmutableSet<T> {
    #getKey: (v: T) => string;
    #keys: Readonly<Set<string>>;

    constructor(getKey: (v: T) => string) {
        this.#getKey = getKey;
        this.#keys = new Set();
    }

    #newFrom(keys: Set<string>) {
        const res = new ImmutableSet(this.#getKey);
        res.#keys = keys;
        return res;
    }

    union(...vv: T[]) {
        const keys = new Set([...this.#keys, ...vv.map(this.#getKey)]);

        if (keys.size == this.#keys.size) {
            return this;
        }

        return this.#newFrom(keys);
    }

    difference(...vv: T[]) {
        const b = new Set(vv.map(this.#getKey));
        const keys = new Set([...this.#keys].filter(k => !b.has(k)));

        if (keys.size == this.#keys.size) {
            return this;
        }

        return this.#newFrom(keys);
    }

    hasAny(...vv: T[]) {
        for (const c of vv) {
            if (this.#keys.has(this.#getKey(c))) {
                return true;
            }
        }
        return false;
    }
}

function receipt2Deposit(r: Cell): Cell {
    return {
        blockNumber: r.blockNumber,
        cellOutput: {
            capacity: Uint128LE.unpack(r.data).toHexString(),
            lock: defaultScript("TYPE_LOCK"),
            type: defaultScript("DAO"),
        },
        data: "0x0000000000000000",
        outPoint: {
            index: BI.from(0).toHexString(),
            txHash: r.outPoint!.txHash!,
        },
    };
}

function midElide(s: string, maxLen: number) {
    const hl = Math.floor((maxLen - 3) / 2);
    return `${s.slice(0, hl)}...${s.slice(s.length - hl)}`;
}

function display(ckbQuantity: BI) {
    return ckbQuantity.div(10 ** 8).toString();
}

function sum(nn: BIish[]) {
    let accumulator = BI.from(0);
    for (const n of nn) {
        accumulator = accumulator.add(n);
    }
    return accumulator;
}