# dCKB rescuer v1 interface

## Setup

### Environment Setup

0. Install `Git`
1. Install `Node.js 16 LTS`
2. Download latest [`ckb (Portable)`](https://github.com/nervosnetwork/ckb/releases/latest), tested with `ckb 0.109.0`
3. Extract the `ckb` compressed folder and renamed it to `~/ckb`

### Devchain configuration

This is section takes material from both [Nervos devchain guide](https://docs.nervos.org/docs/basics/guides/devchain/) and [Ian instructions](https://talk.nervos.org/t/how-to-fork-mainnet-l1-into-a-devnet/7329/5).

From within `~/ckb_dev`:

1. Copy the `data` directory from an existing ckb mainnet installation to `ckb_dev`.

2. Download the corresponding [chain spec file based on mainnet](https://github.com/nervosnetwork/ckb/blob/develop/resource/specs/mainnet.toml).

3. Initialize dev chain and import mainnet chain spec:

```bash
ckb init -c dev --import-spec /path/to/downloaded/mainnet.toml --force
```

4. In the `specs/dev.toml` file change the first line to:

``` toml
name = "ckb_dev"
```

5. In the `specs/dev.toml` file under the `[params]` section set:

``` toml
[params]
genesis_epoch_length = 1743 # keep genesis_epoch_length the same as original file
# Other parameters...
initial_primary_epoch_reward = 1_917_808_21917808
secondary_epoch_reward = 613_698_63013698
max_block_cycles = 10_000_000_000
cellbase_maturity = 0
primary_epoch_reward_halving_interval = 8760
epoch_duration_target = 2 # instead of 14400
permanent_difficulty_in_dummy = true
```

6. In the `specs/dev.toml` file under the `[pow]` section set:

``` toml
[pow]
func = "Dummy"
```

7. In the `ckb.toml` file under the `[block_assembler]` section set:

```toml
[block_assembler]
code_hash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
args = "0xc8328aabcd9b9e8e64fbc566c4385c3bdeb219d7" # ckt1...gwga account
hash_type = "type"
message = "0x"
```

8. In the `ckb.toml` file under the `[logger]` section set:

```toml
[logger]
filter = "info,ckb-script=debug"# instead of "info"
# Other parameters...
```

9. In the `ckb.toml` file under the `[rpc]` section set:
Append `"Indexer"` to `modules`.
```toml
modules = ["Net", "Pool", "Miner", "Chain", "Stats", "Subscription", "Experiment", "Debug", "Indexer"]

```

10. In the `ckb-miner.toml` file under the `[[miner.workers]]` section set:

``` toml
[[miner.workers]]
# Other parameters...
value = 200 # instead of 5000
```

11. Activate the new spec for the first use by running the following command for a few seconds:

``` bash
ckb run --skip-spec-check --overwrite-spec
```

12. In a new terminal start ckb node and miner:

```bash
(trap 'kill -INT 0' SIGINT; cd ~/ckb_dev/; ./ckb run --indexer & sleep 1 && ./ckb miner)
```

### Configure project with local devchain

1. Download this repo in a folder of your choice:  

```bash
git clone https://github.com/dckb-rescuer/v1-interface.git
```

2. Enter into the repo:

```bash
cd v1-interface
```

3. Install dependencies:

```bash
npm i
```

4. Run bot demo:

```bash
npm run start
```
