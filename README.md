# ⚠️ dCKB Rescuer: Discontinued ⚠️

The NervosDAO deposits behind dCKB were drained, so there is nothing left to rescue: https://talk.nervos.org/t/dckb-post-post-mortem-now-the-funds-are-gone/11016

This interface, previously hosted on dckb-rescuer.on.fleek.co, stopped working in 2025. We have no control over that URL after the Fleek migration, a deletion request was filed.

Follows the original Readme.

## Setup

### Environment Setup

0. Install `Git`
1. Install `Node.js 16 LTS`
2. Create `ckb_dev` folder and move the compiled node [`ckb#4097`](https://github.com/nervosnetwork/ckb/pull/4097) in it:

```bash
mkdir ~/ckb_dev &&
cd ~/ckb_dev &&
git clone https://github.com/nervosnetwork/ckb.git &&
mv ckb ckb_tmp &&
cd ckb_tmp &&
git fetch origin pull/4097/head &&
git checkout -b pullrequest FETCH_HEAD &&
make prod_portable &&
mv ./target/prod/ckb ~/ckb_dev &&
cd .. &&
rm -fr ckb_tmp
```

### Devchain configuration

This is section takes material from both [Nervos devchain guide](https://docs.nervos.org/docs/basics/guides/devchain/) and [Ian instructions](https://talk.nervos.org/t/how-to-fork-mainnet-l1-into-a-devnet/7329/5).

1. Copy the `data` directory from an existing ckb mainnet installation to `ckb_dev`:

```bash
cd ~/ckb_dev &&
cp -r ~/.config/Neuron/chains/mainnet/data .
```

2. Download the corresponding [mainnet spec](https://github.com/nervosnetwork/ckb/blob/develop/resource/specs/mainnet.toml) and force import it into a devnet spec:

```bash
cd ~/ckb_dev &&
wget https://raw.githubusercontent.com/nervosnetwork/ckb/develop/resource/specs/mainnet.toml &&
mv mainnet.toml mainnet_tmp.toml &&
./ckb init -c dev --import-spec mainnet_tmp.toml --force &&
rm mainnet_tmp.toml
```

3. In the `specs/dev.toml` file change the first line to:

``` toml
name = "ckb_dev"
```

4. In the `specs/dev.toml` file under the `[params]` section set:

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

5. In the `specs/dev.toml` file under the `[pow]` section set:

``` toml
[pow]
func = "Dummy"
```

6. In the `ckb.toml` file under the `[logger]` section set:

```toml
[logger]
filter = "ckb-script=debug"# instead of "info"
# Other parameters...
```

7. In the `ckb.toml` file under the `[block_assembler]` section set:

```toml
[block_assembler]
code_hash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
args = "0xc8328aabcd9b9e8e64fbc566c4385c3bdeb219d7" # ckt1...gwga account
hash_type = "type"
message = "0x"
```

8. In the `ckb-miner.toml` file under the `[miner.client]` section set:

``` toml
[miner.client]
# Other parameters...
poll_interval = 100 # instead of 1000
```

9. In the `ckb-miner.toml` file under the `[[miner.workers]]` section set:

``` toml
[[miner.workers]]
# Other parameters...
value = 200 # instead of 5000
```

10. In a new terminal start ckb node and miner:

```bash
(trap 'kill -INT 0' SIGINT; cd ~/ckb_dev/; ./ckb run --skip-spec-check --overwrite-spec --indexer & sleep 5 && ./ckb miner)
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
