# InkFundMe - Decentralized Crowdfunding Platform

A complete decentralized crowdfunding platform built with ink! smart contracts and a modern React frontend. InkFundMe allows users to create fundraising campaigns, contribute to causes they care about, and manage funds transparently on the blockchain.

## 🚀 Live Demo

- **Frontend**: [https://inkfundme-tutorial.vercel.app](https://inkfundme-tutorial.vercel.app)
- **Tutorial**: See [TUTORIAL.md](./TUTORIAL.md) for a complete step-by-step guide

## ✨ Features

### Smart Contract Features
- **ERC20 Token Integration**: Custom INKFUNDME token for all transactions
- **Campaign Management**: Create, fund, and finalize fundraising campaigns
- **Faucet Functionality**: Free token minting for testing and onboarding
- **Automatic Refund System**: Contributors get refunds if campaigns fail
- **Transparent Event Logging**: All activities tracked on-chain

### Frontend Features
- **Modern React UI**: Built with Vite, TypeScript, and Tailwind CSS
- **PAPI Integration**: Seamless blockchain interaction with Polkadot API
- **ReactiveDOT**: Real-time updates and reactive state management
- **Account Mapping**: Automatic SS58 to EVM address conversion
- **Responsive Design**: Works perfectly on desktop and mobile
- **Toast Notifications**: Real-time feedback for all user actions
- **Loading States**: Comprehensive UX with loading indicators

## 🏗️ Project Structure

```
inkfundme/
├── contracts/                 # ink! Smart Contracts
│   ├── src/
│   │   ├── token/            # ERC20 token contract
│   │   └── inkfundme/        # Main crowdfunding contract
│   ├── Makefile              # Build and deployment scripts
│   └── target/               # Compiled contracts
├── frontend/                 # React Frontend
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Route components
│   │   └── lib/             # Utilities and contracts
│   └── .papi/               # Generated PAPI descriptors
└── TUTORIAL.md              # Complete tutorial guide
```

## 🔧 Architecture

### Smart Contracts
1. **Token Contract** (`contracts/src/token/`): ERC20 token with minting capabilities
2. **InkFundMe Contract** (`contracts/src/inkfundme/`): Main crowdfunding logic

### Frontend Stack
- **React 19** with TypeScript for type safety
- **Vite** for fast development and building
- **PAPI** for blockchain interaction
- **ReactiveDOT** for reactive state management
- **Tailwind CSS** for styling
- **shadcn/ui** for component library

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

## 🚀 Quick Start

### Prerequisites
- [Rust & ink!](https://use.ink/docs/v6/)
- [Node.js 18+](https://nodejs.org/)
- [cargo-contract](https://github.com/use-ink/cargo-contract)
- [Polkadot.js extension](https://polkadot.js.org/extension/)

### 1. Clone and Setup
```bash
git clone https://github.com/truthixify/inkfundme.git
cd inkfundme
```

### 2. Deploy Smart Contracts
```bash
cd contracts

# Build contracts
make build
# OR: cargo contract build --manifest-path ./src/token/Cargo.toml
#     cargo contract build --manifest-path ./src/inkfundme/Cargo.toml

# Configure for Passet Hub testnet
echo 'ACCOUNT_URI=your-seed-phrase' > .env
echo 'CHAIN=wss://testnet-passet-hub.polkadot.io' >> .env

# Deploy contracts
make instantiate-token
make instantiate-inkfundme
# OR use the full cargo contract instantiate commands (see TUTORIAL.md)
```

### 3. Setup Frontend
```bash
cd frontend

# Install dependencies
npm install

# Generate contract descriptors
npm run codegen

# Update contract addresses in src/lib/constants.ts
# TOKEN_ADDRESS = "your-deployed-token-address"
# INK_FUND_ME_ADDRESS = "your-deployed-inkfundme-address"

# Start development server
npm run dev
```

### 4. Deploy to Vercel
```bash
cd frontend
npm run build
vercel
```

> **📖 For detailed instructions, see [TUTORIAL.md](./TUTORIAL.md)**

## 💡 How It Works

### For Campaign Creators
1. **Connect Wallet**: Use Polkadot.js extension
2. **Map Account**: One-time setup for contract interaction
3. **Create Campaign**: Set title, description, goal, and deadline
4. **Share Campaign**: Get contributions from supporters
5. **Finalize**: After deadline, claim funds if goal is met

### For Contributors
1. **Browse Campaigns**: Explore active fundraising campaigns
2. **Get Test Tokens**: Use the built-in faucet for testing
3. **Contribute**: Support campaigns you believe in
4. **Track Progress**: See real-time funding progress
5. **Get Refunds**: Automatic refunds if campaigns fail

### Smart Contract Logic
- **Success**: If goal is reached, funds go to campaign creator
- **Failure**: If goal isn't reached, contributors can claim full refunds
- **Transparency**: All transactions and events are recorded on-chain
- **Security**: Built-in protections against common vulnerabilities

## Security Considerations

1. **Reentrancy**: The contract uses cross-contract calls but follows checks-effects-interactions pattern
2. **Integer Overflow**: Uses checked arithmetic operations where needed
3. **Access Control**: Faucet is intentionally public for tutorial purposes
4. **Deadline Validation**: Ensures deadlines are in the future when creating campaigns
5. **State Validation**: Comprehensive checks before state changes

## 🧪 Testing

### Smart Contract Tests
```bash
cd contracts
cargo test --manifest-path src/inkfundme/Cargo.toml
cargo test --manifest-path src/token/Cargo.toml
```

### Frontend Testing
```bash
cd frontend
npm run build  # Verify build works
npm run preview  # Test production build locally
```

## 🛠️ Development

### Key Technologies
- **ink!**: Smart contract development framework
- **PAPI**: Polkadot API for blockchain interaction
- **ReactiveDOT**: Reactive state management for Substrate
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework

### Project Highlights
- **Type-Safe Contract Interaction**: Generated TypeScript bindings from ink! contracts
- **Real-Time Updates**: Reactive UI that updates with blockchain state
- **Error Handling**: Comprehensive error handling and user feedback
- **Mobile Responsive**: Works seamlessly across all devices
- **Production Ready**: Deployed and tested on Passet Hub testnet

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📚 Resources

- [Complete Tutorial](./TUTORIAL.md) - Step-by-step guide to building this dApp
- [ink! Documentation](https://use.ink/)
- [PAPI Documentation](https://papi.how/)
- [ReactiveDOT](https://reactivedot.dev/)
- [Live Demo](https://inkfundme-tutss.vercel.app)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using ink!, PAPI, and ReactiveDOT**