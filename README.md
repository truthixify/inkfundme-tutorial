# InkFundMe Smart Contract

A decentralized crowdfunding platform built with ink! smart contracts on Substrate. InkFundMe allows users to create fundraising campaigns and accept contributions using ERC20 tokens.

## Features

- **ERC20 Token Integration**: Uses a custom ERC20 token for all transactions
- **Campaign Management**: Create, fund, and finalize fundraising campaigns
- **Faucet Functionality**: Free token minting for testing purposes
- **Refund System**: Automatic refunds for failed campaigns
- **Event Logging**: Comprehensive event system for tracking activities

## Contract Architecture

The InkFundMe system consists of two main contracts:

1. **Token** (`token`): ERC20 token with minting capabilities
2. **InkFundMe** (`inkfundme`): Main crowdfunding contract

## Contract Structures

### Campaign Structure
```rust
pub struct Campaign {
    pub id: u32,           // Unique campaign identifier
    pub title: String,     // Campaign title
    pub description: String, // Campaign description
    pub goal: U256,        // Fundraising goal in tokens
    pub deadline: u64,     // Campaign deadline (timestamp)
    pub owner: Address,    // Campaign creator address
    pub raised: U256,      // Amount raised so far
    pub completed: bool,   // Whether campaign is finalized
}
```

## Main Functions

### Constructor Functions

#### `new(token_total_supply: U256)`
Creates a new InkFundMe contract and deploys an ERC20 token with the specified initial supply.

#### `new_with_token(token_address: Address)`
Creates a new InkFundMe contract using an existing ERC20 token.

### Token Functions

#### `mint_faucet(to: Address, amount: U256)`
**Public faucet function** - Mints tokens for free to any address. Useful for testing and tutorials.
- No restrictions on who can call this function
- No supply cap for simplicity
- Calls the ERC20 contract's mint function via cross-contract call

### Campaign Functions

#### `create_campaign(title: String, description: String, goal: U256, deadline: u64) -> u32`
Creates a new fundraising campaign.
- Returns the campaign ID
- Validates that goal > 0 and deadline is in the future
- Emits `CampaignCreated` event

#### `contribute(campaign_id: u32, amount: U256)`
Contribute tokens to a campaign.
- Transfers tokens from contributor to contract using `transfer_from`
- Updates campaign raised amount and contributor tracking
- Fails if deadline passed or campaign completed
- Emits `ContributionMade` event

#### `finalize(campaign_id: u32)`
Finalizes a campaign after the deadline.
- If goal met: transfers raised funds to campaign owner
- If goal not met: marks campaign as failed (enables refunds)
- Can only be called after deadline
- Emits `CampaignFinalized` event

#### `claim_refund(campaign_id: u32)`
Allows contributors to claim refunds from failed campaigns.
- Only works for completed campaigns that didn't meet their goal
- Transfers contributor's tokens back to them
- Removes contribution from tracking
- Emits `RefundClaimed` event

### Query Functions

#### `get_campaign(campaign_id: u32) -> Campaign`
Returns campaign details by ID.

#### `get_all_campaigns() -> Vec<Campaign>`
Returns all campaigns.

#### `get_contribution(campaign_id: u32, contributor: Address) -> U256`
Returns the amount a specific contributor has contributed to a campaign.

#### `get_token_address() -> Address`
Returns the address of the ERC20 token contract.

#### `get_campaign_count() -> u32`
Returns the total number of campaigns created.

## Events

### `CampaignCreated`
```rust
CampaignCreated {
    id: u32,
    owner: Address,
    goal: U256,
    deadline: u64,
}
```

### `ContributionMade`
```rust
ContributionMade {
    campaign_id: u32,
    contributor: Address,
    amount: U256,
}
```

### `CampaignFinalized`
```rust
CampaignFinalized {
    campaign_id: u32,
    success: bool,
}
```

### `RefundClaimed`
```rust
RefundClaimed {
    campaign_id: u32,
    contributor: Address,
    amount: U256,
}
```

## Error Handling

The contract includes comprehensive error handling:

- `CampaignNotFound`: Campaign ID doesn't exist
- `DeadlineNotReached`: Trying to finalize before deadline
- `DeadlineReached`: Trying to contribute after deadline
- `CampaignCompleted`: Trying to interact with finalized campaign
- `GoalNotMet`: Trying to claim refund from successful campaign
- `NoContribution`: No contribution found for refund
- `OnlyOwner`: Unauthorized access (if applicable)
- `TokenError`: ERC20 operation failed
- `InvalidParameters`: Invalid input parameters

## Deployment Guide

### 1. Deploy the ERC20 Token Contract

First, deploy the `InkFundMeToken` contract:

```bash
# Build the token contract
cargo contract build --manifest-path src/token/Cargo.toml

# Deploy with initial parameters
# name: "InkFundMe Token"
# symbol: "IFM" 
# decimals: 18
# initial_supply: 1000000 (1M tokens)
```

### 2. Deploy the InkFundMe Contract

Option A: Deploy with new token
```bash
# Build the main contract
cargo contract build --manifest-path src/inkfundme/Cargo.toml

# Deploy with token supply parameter
# token_total_supply: 1000000
```

Option B: Deploy with existing token
```bash
# Deploy with existing token address
# token_address: <deployed_token_address>
```

## Usage Examples

### 1. Get Free Tokens (Faucet)
```rust
// Anyone can call this to get free tokens for testing
inkfundme.mint_faucet(user_address, 1000);
```

### 2. Create a Campaign
```rust
let campaign_id = inkfundme.create_campaign(
    "Save the Whales".to_string(),
    "Help us protect whale habitats".to_string(),
    10000, // Goal: 10,000 tokens
    1735689600, // Deadline: Jan 1, 2025
)?;
```

### 3. Contribute to a Campaign
```rust
// First approve the InkFundMe contract to spend your tokens
token.approve(inkfundme_address, 500)?;

// Then contribute
inkfundme.contribute(campaign_id, 500)?;
```

### 4. Finalize a Campaign
```rust
// After deadline passes, anyone can finalize
inkfundme.finalize(campaign_id)?;
```

### 5. Claim Refund (if campaign failed)
```rust
// Contributors can claim refunds from failed campaigns
inkfundme.claim_refund(campaign_id)?;
```

## Security Considerations

1. **Reentrancy**: The contract uses cross-contract calls but follows checks-effects-interactions pattern
2. **Integer Overflow**: Uses checked arithmetic operations where needed
3. **Access Control**: Faucet is intentionally public for tutorial purposes
4. **Deadline Validation**: Ensures deadlines are in the future when creating campaigns
5. **State Validation**: Comprehensive checks before state changes

## Testing

The contract includes comprehensive unit tests covering:
- Contract initialization
- Campaign creation and validation
- Error conditions
- Edge cases

Run tests with:
```bash
cargo test --manifest-path src/inkfundme/Cargo.toml
cargo test --manifest-path src/token/Cargo.toml
```

## Production Considerations

For production deployment, consider:

1. **Access Control**: Add owner/admin controls to the faucet function
2. **Supply Caps**: Implement maximum supply limits for the token
3. **Fee Structure**: Add platform fees for campaign creation or success
4. **Governance**: Implement governance mechanisms for contract upgrades
5. **Oracle Integration**: Use price oracles for multi-currency support
6. **Gas Optimization**: Optimize storage and computation for lower fees

## License

This project is licensed under the MIT License - see the LICENSE file for details.