# Building a Crowdfunding dApp with ink! Smart Contracts and PAPI/ReactiveDOT

Hey there! Ready to build something awesome? In this tutorial, we'll create a decentralized crowdfunding platform from scratch using ink! smart contracts and a modern React frontend. Think of this as us coding together - I'll walk you through each step, explain the important decisions, and make sure you understand both the how and the why.

We'll be working with the InkFundMe smart contract, integrating it with a sleek frontend using PAPI (Polkadot API) and ReactiveDOT. By the end, you'll have a fully functional dApp where users can create campaigns, make contributions, and manage their fundraising goals. You can grab the complete code here: [InkFundMe Repository](https://github.com/truthixify/inkfundme.git).

---

## Project Overview

We're building **InkFundMe**, a crowdfunding dApp that combines the power of ink! smart contracts with a modern React frontend.

Here's what we're working with:
- **ink! smart contracts**: Two contracts - an ERC20 token and the main crowdfunding logic
- **React frontend**: Built with Vite, TypeScript, and Tailwind CSS
- **PAPI integration**: Using Polkadot API for seamless blockchain interaction
- **ReactiveDOT**: A reactive library for building Substrate front-ends

The flow is simple: users create campaigns with funding goals and deadlines, contributors can donate using our custom ERC20 tokens, and the smart contract handles all the logic for successful funding or refunds.

---

## Prerequisites

Before we dive in, make sure you have these tools ready:

- **Rust & ink!** – [Install Rust](https://rustup.rs/) and [ink! CLI](https://use.ink/docs/v6/)
- **Node.js (v18+)** – [Download from nodejs.org](https://nodejs.org/)
- **npm** – comes with Node.js
- **cargo-contract** – [ink! contract CLI tool](https://github.com/use-ink/cargo-contract)
- **Make** (optional) – [Install Make](https://www.gnu.org/software/make/) or use the full cargo commands
- **Polkadot.js extension** – [Browser extension](https://polkadot.js.org/extension/)
- **Git** – [Install Git](https://git-scm.com/)

If you're missing any of these, install them before continuing. The ink! documentation has great setup guides.

---

## Smart Contract Deep Dive

### Contract Location in Repository

The smart contracts are located in the `contracts/` directory:

```
contracts/
├── src/
│   ├── token/           # ERC20 token contract
│   │   ├── lib.rs       # Token implementation
│   │   └── Cargo.toml   # Token dependencies
│   └── inkfundme/       # Main crowdfunding contract
│       ├── lib.rs       # InkFundMe implementation
│       └── Cargo.toml   # InkFundMe dependencies
├── Makefile             # Build and deployment scripts
└── target/              # Compiled contracts (generated)
    └── ink/
        ├── token/
        │   └── token.contract    # Compiled token contract
        └── inkfundme/
            └── inkfundme.contract # Compiled InkFundMe contract
```

### Contract Architecture

Our system uses two smart contracts working together:

1. **Token Contract** (`contracts/src/token/lib.rs`): A custom ERC20 token with minting capabilities
2. **InkFundMe Contract** (`contracts/src/inkfundme/lib.rs`): The main crowdfunding logic

### Token Contract Features

The token contract is straightforward but powerful:

```rust
#[ink(storage)]
#[derive(Default)]
pub struct Token {
    total_supply: U256,
    balances: Mapping<Address, U256>,
    allowances: Mapping<(Address, Address), U256>,
    name: String,
    symbol: String,
    decimals: u8,
}
```

**Key Functions**:
- Standard ERC20 operations: `transfer`, `transfer_from`, `approve`, `allowance`
- **Minting capability**: `mint` function for creating new tokens
- **Faucet functionality**: Free tokens for testing and onboarding

### InkFundMe Contract Structure

The main contract handles all crowdfunding logic:

```rust
#[derive(Clone, Debug, PartialEq, Eq)]
#[ink::scale_derive(Encode, Decode, TypeInfo)]
pub struct Campaign {
    pub id: u32,           // Unique identifier
    pub title: String,     // Campaign name
    pub description: String, // Campaign details
    pub goal: U256,        // Funding target
    pub deadline: u64,     // End timestamp
    pub owner: Address,    // Creator address
    pub raised: U256,      // Current funding
    pub completed: bool,   // Finalization status
}

#[ink(storage)]
pub struct InkFundMe {
    token_contract: TokenRef,                    // ERC20 token reference
    campaigns: StorageVec<Campaign>,             // All campaigns
    contributions: Mapping<(u32, Address), U256>, // Contribution tracking
    next_campaign_id: u32,                       // ID counter
}
```

**Design Decisions**:
- `U256` for token amounts ensures compatibility and handles large numbers
- `StorageVec` for gas-efficient campaign storage
- `Mapping` for constant contribution lookups
- Separation of concerns between token and crowdfunding logic

### Core Contract Functions

#### Campaign Creation
```rust
#[ink(message)]
pub fn create_campaign(
    &mut self,
    title: String,
    description: String,
    goal: U256,
    deadline: u64,
) -> Result<u32> {
    // Validation
    if goal == U256::zero() || deadline <= self.env().block_timestamp() {
        return Err(Error::InvalidParameters);
    }

    let campaign_id = self.next_campaign_id;
    let campaign = Campaign {
        id: campaign_id,
        title,
        description,
        goal,
        deadline,
        owner: self.env().caller(),
        raised: U256::zero(),
        completed: false,
    };

    self.campaigns.push(&campaign);
    self.next_campaign_id += 1;

    self.env().emit_event(CampaignCreated {
        id: campaign_id,
        owner: campaign.owner,
        goal,
        deadline,
    });

    Ok(campaign_id)
}
```

#### Contributing to Campaigns
```rust
#[ink(message)]
pub fn contribute(&mut self, campaign_id: u32, amount: U256) -> Result<()> {
    let campaign = self.get_campaign_mut(campaign_id)?;
    let caller = self.env().caller();

    // Validation checks
    if campaign.completed {
        return Err(Error::CampaignCompleted);
    }
    if self.env().block_timestamp() > campaign.deadline {
        return Err(Error::DeadlineReached);
    }

    // Transfer tokens from contributor to contract
    self.token_contract.transfer_from(caller, self.env().account_id(), amount)?;
    
    // Update campaign and contribution tracking
    campaign.raised = campaign.raised.checked_add(amount).ok_or(Error::Overflow)?;
    let existing = self.contributions.get((campaign_id, caller)).unwrap_or(U256::zero());
    self.contributions.insert((campaign_id, caller), &(existing + amount));

    self.env().emit_event(ContributionMade {
        campaign_id,
        contributor: caller,
        amount,
    });

    Ok(())
}
```

#### Finalizing Campaigns - The Smart Decision Maker

Here's where things get interesting! The `finalize` function is like the judge that decides what happens to all the money once a campaign ends. Think of it as the moment of truth - did we reach our goal or not?

```rust
#[ink(message)]
pub fn finalize(&mut self, campaign_id: u32) -> Result<()> {
    let mut campaign = self.get_campaign_mut(campaign_id)?;
    let caller = self.env().caller();

    // Only campaign owner can finalize
    if caller != campaign.owner {
        return Err(Error::OnlyOwner);
    }

    // Must wait until deadline passes
    if self.env().block_timestamp() <= campaign.deadline {
        return Err(Error::DeadlineNotReached);
    }

    // Prevent double finalization
    if campaign.completed {
        return Err(Error::CampaignCompleted);
    }

    let success = campaign.raised >= campaign.goal;
    campaign.completed = true;

    if success {
        // 🎉 Success! Transfer all funds to campaign owner
        self.token_contract.transfer(campaign.owner, campaign.raised)?;
    }
    // 😞 Failed? Funds stay locked in contract for contributors to claim refunds

    self.env().emit_event(CampaignFinalized { campaign_id, success });
    Ok(())
}
```

**What's happening here?** The contract automatically decides the fate of the funds:

- **Campaign succeeded** (raised ≥ goal): All the money goes straight to the campaign creator. Contributors get nothing back, but they supported a successful project!
- **Campaign failed** (raised < goal): The money stays locked in the contract, and each contributor can claim their full refund. Nobody loses money on a failed project.

This is the beauty of smart contracts - no human judgment calls, no disputes, just pure math deciding what's fair.

#### Claiming Refunds - Getting Your Money Back

When a campaign doesn't reach its goal, contributors shouldn't lose their money. That's where `claim_refund` comes to the rescue! It's like having an automatic insurance policy built into the contract.

```rust
#[ink(message)]
pub fn claim_refund(&mut self, campaign_id: u32) -> Result<()> {
    let campaign = self.get_campaign(campaign_id)?;
    let contributor = self.env().caller();

    // Campaign must be completed and failed
    if !campaign.completed {
        return Err(Error::CampaignCompleted);
    }
    if campaign.raised >= campaign.goal {
        return Err(Error::GoalNotMet);
    }

    // Get contributor's amount
    let contribution = self.contributions.get((campaign_id, contributor)).unwrap_or_default();
    if contribution == U256::zero() {
        return Err(Error::NoContribution);
    }

    // Clear contribution and refund
    self.contributions.remove((campaign_id, contributor));
    self.token_contract.transfer(contributor, contribution)?;

    self.env().emit_event(RefundClaimed { campaign_id, contributor, amount: contribution });
    Ok(())
}
```

**The refund process is bulletproof:**

1. **Double-check the campaign failed** - No refunds for successful campaigns (that would be stealing from the creator!)
2. **Verify you actually contributed** - Can't claim money you never put in
3. **One refund per person** - Once you claim, your contribution record gets wiped to prevent double-dipping
4. **Instant transfer** - Your tokens come back immediately, no waiting periods

This creates a win-win situation: creators get funded if they hit their goals, and contributors never lose money on failed projects.

### Query Functions - Your Window Into the Contract

These are the "read-only" functions that let you peek inside the contract without changing anything. Think of them as your dashboard for checking what's happening:

- **`get_campaign(campaign_id: u32)`** - Want details about a specific campaign? This gives you everything - title, description, goal, how much is raised, deadline, and whether it's completed.

- **`get_all_campaigns()`** - Perfect for building your homepage! This returns every single campaign in the contract, so you can display them all in a nice grid.

- **`get_contribution(campaign_id: u32, contributor: Address)`** - "How much did Alice contribute to campaign #5?" This function has the answer. Super useful for showing users their contribution history.

- **`get_token_address()`** - Returns the address of the ERC20 token contract. Your frontend needs this to interact with the token (like checking balances or approving transfers).

- **`get_campaign_count()`** - A simple counter of how many campaigns exist. Great for pagination or showing stats like "Join 1,247 other campaigns!"

These functions are free to call (no gas costs) and never change the blockchain state - they're just for reading data.

### Security Patterns - How We Keep Your Funds Safe

Building a crowdfunding platform means handling real money, so security isn't optional - it's everything. Here are the key security patterns we've baked into the contract to protect everyone involved:

**Checks-Effects-Interactions Pattern**: We always validate everything first, update our internal state second, and only then interact with external contracts. This prevents sneaky reentrancy attacks where malicious contracts try to drain funds.

**Safe Math Operations**: We use checked arithmetic that panics on overflow instead of wrapping around. No more "I contributed 1 token but somehow it became 18 quintillion tokens" bugs.

**Comprehensive Input Validation**: Every function checks its inputs thoroughly. Zero goals? Nope. Past deadlines? Not happening. We catch these issues before they can cause problems.

**Event Emission for Transparency**: Every important action emits an event. This creates an immutable audit trail that frontends can use to show real-time updates and users can verify on-chain.

**Owner-Only Functions**: Only campaign creators can finalize their campaigns. This prevents random people from prematurely ending campaigns or stealing funds.

**Proper State Validation for Refunds**: Multiple layers of checks ensure refunds only happen for failed campaigns, only to actual contributors, and only once per person.

These aren't just theoretical concepts - they're battle-tested patterns that protect millions of dollars in DeFi protocols every day.

---

## Setting Up the Development Environment

### 1. Clone and Setup

```bash
git clone https://github.com/truthixify/inkfundme.git
cd inkfundme
```

### 2. Contract Development Setup

```bash
cd contracts

# Build both contracts (if you have Make installed)
make build

# OR use the full cargo commands:
cargo contract build --manifest-path ./src/token/Cargo.toml
cargo contract build --manifest-path ./src/inkfundme/Cargo.toml
```

### 3. Contract Deployment

The project includes a Makefile for easy deployment. First, configure your environment for Passet Hub testnet:

```bash
# Create .env file in contracts directory
echo 'ACCOUNT_URI=your-seed-phrase-or-private-key' > .env
echo 'CHAIN=wss://testnet-passet-hub.polkadot.io' >> .env
```

Deploy the contracts:
```bash
# Deploy token contract first (with Make)
make instantiate-token

# OR use the full cargo command:
cargo contract instantiate \
    --constructor new \
    --args \"INKFUNDME\" \"IFM\" 0 1000 \
    --suri "your-seed-phrase" \
    --url wss://testnet-passet-hub.polkadot.io \
    --manifest-path ./src/token/Cargo.toml \
    --execute

# Note the deployed address, then update TOKEN_ADDRESS in Makefile or use it directly
# Deploy InkFundMe contract (with Make)
make instantiate-inkfundme

# OR use the full cargo command:
cargo contract instantiate \
    --constructor new \
    --args 0x1f92b64f3e344dfd020ccd287e39a660ba329262 \
    --suri "your-seed-phrase" \
    --url wss://testnet-passet-hub.polkadot.io \
    --manifest-path ./src/inkfundme/Cargo.toml \
    --execute
```

**Important**: After deployment, update the contract addresses in:
- `contracts/Makefile` (TOKEN_ADDRESS variable) if using Make
- `frontend/src/lib/constants.ts` (TOKEN_ADDRESS and INK_FUND_ME_ADDRESS)

---

## Frontend Integration with PAPI and ReactiveDOT

### Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── lib/
│   │   ├── contracts.ts    # Contract definitions
│   │   └── constants.ts    # Contract addresses and config
│   ├── pages/              # Route components
│   └── main.tsx           # App entry point
├── .papi/                  # Generated PAPI files
└── package.json
```

### 1. Install Dependencies

```bash
cd frontend
npm install
```

Key dependencies:
- `@polkadot-api/descriptors` - Generated contract descriptors
- `@polkadot-api/sdk-ink` - ink! contract SDK
- `@reactive-dot/react` - ReactiveDOT React integration
- `polkadot-api` - Core Polkadot API

### 2. Generate Contract Descriptors

This is where the magic happens - we generate TypeScript bindings from our compiled contracts:

```bash
# Add the Passet Hub testnet
npm run postinstall
# This runs: npx papi add passetHub -w wss://testnet-passet-hub.polkadot.io

# Generate contract descriptors from compiled contracts
npm run codegen
# This runs:
# npx papi ink add ../contracts/target/ink/token/token.contract
# npx papi ink add ../contracts/target/ink/inkfundme/inkfundme.contract
```

**What happens here**:
1. PAPI reads your compiled `.contract` files
2. Generates TypeScript types and descriptors
3. Creates files in `.papi/descriptors/` and `.papi/contracts/`
4. Updates `polkadot-api.json` configuration

### 3. Configure Contract References

After running codegen, you can import the generated descriptors:

```typescript
// frontend/src/lib/contracts.ts
import { contracts } from "@polkadot-api/descriptors"

export const token = {
    contract: contracts.token,
}

export const inkFundMe = {
    contract: contracts.inkfundme,
}
```

### 4. Set Contract Addresses

Update the deployed contract addresses:

```typescript
// frontend/src/lib/constants.ts
export const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"

export const FAUCET_URLS: { [key: string]: string } = {
    pop: "https://learn.onpop.io/contracts/guides/bridge-tokens-to-pop-network",
    passethub: "https://faucet.polkadot.io/?parachain=1111",
    dev: "https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:9944#/accounts",
}

// Replace these with your deployed contract addresses
export const TOKEN_ADDRESS = "0x1f92b64f3e344dfd020ccd287e39a660ba329262"
export const INK_FUND_ME_ADDRESS = "0xa89c351e2ddd04cdc65aaed75b4dea5f1c0be279"
```

**Getting Contract Addresses**:
When you run `make instantiate-token` and `make instantiate-inkfundme`, the output will show the deployed addresses. Look for lines like:
```
Contract 0xca1b92ff69afe515131c5a4ce8c4066db2f418db
```

---

## Building the Frontend Components

### 1. Setting Up ReactiveDOT Provider

```typescript
// frontend/src/main.tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"

// Pages
import HomePage from "./pages/home"
import CampaignPage from "./pages/campaign"
import { createBrowserRouter, RouterProvider } from "react-router-dom"

const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        children: [
            { index: true, element: <HomePage /> },
            { path: "campaign/:id", element: <CampaignPage /> },
        ],
    },
])

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
)
```

### 2. Contract Interaction Hooks

The project includes several custom hooks for seamless contract interactions. Here are the key ones:

**Account Mapping Hook (`use-is-mapped.tsx`):**
```typescript
export function useIsMapped() {
    const api = useTypedApi()
    const { signerAddress } = useSignerAndAddress()
    const [isMapped, setIsMapped] = useState<boolean>()

    const updateIsMapped = useCallback(async () => {
        if (!api || !signerAddress) {
            setIsMapped(undefined)
            return
        }

        const evmSignerAddress = ss58ToEthereum(signerAddress)
        const isMapped = !!(await (api.query.Revive as any).OriginalAccount.getValue(
            evmSignerAddress
        ))
        setIsMapped(isMapped)
    }, [api, signerAddress])

    return isMapped
}
```

**Signer Hook (`use-signer-and-address.tsx`):**
```typescript
export function useSignerAndAddress() {
    const signer = useSigner()
    if (!signer?.publicKey) return {}

    let signerAddress: string | undefined
    try {
        signerAddress = AccountId().dec(signer.publicKey)
    } catch (error) {
        console.error(error)
        return {}
    }

    return { signer, signerAddress }
}
```

> **Note**: These hooks handle the complex logic of wallet connection, address conversion, and account mapping status. Check the full implementations in `frontend/src/hooks/` for complete error handling and state management.

### 3. Campaign Card Component

The project includes a `CampaignCard` component that displays individual campaigns. Here's a simplified version:

```typescript
// frontend/src/components/campaign-card.tsx (simplified)
import { formatDistanceToNowStrict } from "date-fns"
import { Link } from "react-router-dom"
import type { FixedSizeArray, FixedSizeBinary } from "polkadot-api"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Progress } from "./ui/progress"

type Campaign = {
    id: number
    title: string
    description: string
    goal: FixedSizeArray<4, bigint>
    deadline: bigint
    owner: FixedSizeBinary<20>
    raised: FixedSizeArray<4, bigint>
    completed: boolean
}

export function CampaignCard({ campaign, tokenInfo }: { 
    campaign: Campaign, 
    tokenInfo: TokenInfo 
}) {
    const progress = Number(campaign.raised[0]) / Number(campaign.goal[0]) * 100
    const isExpired = Date.now() / 1000 > Number(campaign.deadline)

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="line-clamp-2">{campaign.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-3">
                    {campaign.description}
                </p>
                
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{campaign.raised[0].toString()} {tokenInfo?.symbol}</span>
                        <span>Goal: {campaign.goal[0].toString()}</span>
                    </div>
                </div>
                
                {/* More UI elements... */}
            </CardContent>
        </Card>
    )
}
```

> **Note**: This is a simplified version. Check the full implementation in `frontend/src/components/campaign-card.tsx` for complete functionality including contribution handling, status badges, and responsive design.

### 4. Advanced Features in the dApp

The project includes several advanced features that make it production-ready:

**🎯 Smart Contract Integration:**
- **Token Faucet**: Users can mint free test tokens directly from the dApp
- **Approval System**: Automatic token approval handling for contributions
- **Account Mapping**: Seamless SS58 to EVM address mapping
- **Real-time Updates**: Live campaign data refreshing after transactions

**💡 User Experience Enhancements:**
- **Loading States**: Comprehensive loading indicators for all operations
- **Error Handling**: User-friendly error messages with transaction cancellation support
- **Toast Notifications**: Real-time feedback for all user actions
- **Responsive Design**: Works perfectly on desktop and mobile devices

**🔧 Developer-Friendly Features:**
- **TypeScript Integration**: Full type safety with generated contract types
- **Modular Components**: Reusable UI components with shadcn/ui
- **Custom Hooks**: Clean separation of blockchain logic from UI components
- **Error Boundaries**: Graceful error handling throughout the application

**Key Components You'll Find:**
- **Campaign Cards** (`campaign-card.tsx`) - Display individual campaigns with progress bars
- **Create Campaign Form** (`create-campaign-form.tsx`) - Full form with validation
- **Campaign Detail Page** (`campaign.tsx`) - Complete campaign management interface
- **Map Account Button** (`map-account-button.tsx`) - Handles account mapping UX

> **Note**: Each component includes comprehensive error handling, loading states, and user feedback. Check the full implementations in `frontend/src/components/` and `frontend/src/pages/` to see the complete feature set.

---

## Key Integration Patterns

### 1. U256 Handling

ink! contracts use U256 for large numbers, but JavaScript uses BigInt. Here's how to handle the conversion:

```typescript
// Convert JavaScript number to U256 format
const amountU256 = [BigInt(amount), 0n, 0n, 0n]

// Convert U256 back to JavaScript
const jsAmount = Number(u256Value[0])
```

### 2. Address Handling and Account Mapping

Before diving into contract interactions, there's an important step you need to understand: **account mapping**. This is a unique requirement when working with ink! contracts on Substrate chains.

#### What is Account Mapping?

Think of account mapping as registering your Substrate address (SS58 format) with the contract runtime so it can interact with EVM-style contracts. It's like getting a passport to enter a different country, you need it stamped before you can do business there.

```typescript
import { ss58ToEthereum } from '@polkadot-api/sdk-ink'

// Convert SS58 address to Ethereum format for contract calls
const evmAddress = ss58ToEthereum(ss58Address)

// Check if an address is already mapped
const sdk = createReviveSdk(api, inkFundMe.contract)
const isMapped = await sdk.addressIsMapped(signerAddress)

if (!isMapped) {
    console.log("Account needs to be mapped first!")
    // User needs to call the map_account transaction
}
```

#### The Mapping Process

Every account must be mapped before it can interact with contracts (even for read-only queries). Here's how the project handles this:

**1. Check if Mapped (useIsMapped hook):**
```typescript
// frontend/src/hooks/use-is-mapped.tsx
export function useIsMapped() {
    const api = useTypedApi()
    const { signerAddress } = useSignerAndAddress()
    const [isMapped, setIsMapped] = useState<boolean>()

    const updateIsMapped = useCallback(async () => {
        if (!api || !signerAddress) {
            setIsMapped(undefined)
            return
        }

        const evmSignerAddress = ss58ToEthereum(signerAddress)
        const isMapped = !!(await api.query.Revive.OriginalAccount.getValue(evmSignerAddress))
        setIsMapped(isMapped)
    }, [api, signerAddress])

    return isMapped
}
```

**2. Map Account Button:**
The project includes a handy `MapAccountButton` component (`frontend/src/components/map-account-button.tsx`) that automatically appears when an account needs mapping:

```typescript
// Simplified version of the mapping process
const handleMapAccount = async () => {
    const tx = api.tx.Revive.map_account()
        .signAndSubmit(signer)
    
    // Once successful, the account can interact with contracts
}
```

**Why This Matters:**
- **First-time users** will see a "Map" button before they can contribute or create campaigns
- **Returning users** won't see this button if they're already mapped
- **Failed transactions** often happen because users forgot to map their account first

This is all handled automatically by the UI, but understanding it helps you debug issues and explain to users why they might see an extra step before using your dApp.

### 3. Error Handling

Wrap contract calls in try-catch blocks:

```typescript
try {
    const result = await contract.send('function_name', { ... })
    // Handle success
} catch (error) {
    if (error.message.includes('DeadlineReached')) {
        // Handle specific contract error
    } else {
        // Handle general error
    }
}
```

---

## Testing and Development

### 1. Testnet Setup

For Passet Hub testnet development:

1. Get testnet tokens from the [faucet](https://faucet.polkadot.io/?parachain=1111)
2. Update your `.env` with testnet configuration
3. Deploy contracts to testnet using the `make instantiate-` commands
4. Update frontend constants with deployed addresses

Start the frontend:
```bash
cd frontend
npm run dev
```

### 2. Testing Contract Functions

Use the faucet function to get test tokens:

```typescript
// Get free tokens for testing
const mintTokens = async (amount: bigint) => {
    const sdk = createInkSdk(api, token.contract)
    const contract = sdk.getContract(TOKEN_ADDRESS)
    
    const tx = contract.send('mint_faucet', {
        origin: signerAddress,
        data: {
            to: signerAddress,
            amount: [amount, 0n, 0n, 0n]
        }
    })
    
    return await tx.signAndSubmit(signer)
}
```

---

## Advanced Features and Next Steps

### 1. Enhanced UI/UX
- Add loading states and error boundaries
- Implement pagination for large campaign lists
- Add search and filtering capabilities
- Create detailed campaign pages with progress charts

### 2. Smart Contract Improvements
- Add campaign categories and tags
- Implement milestone-based funding
- Add campaign update functionality
- Create governance mechanisms for dispute resolution

### 3. Integration Enhancements
- Add IPFS integration for campaign media
- Implement push notifications for campaign updates
- Add social sharing features
- Create analytics dashboard

### 4. Security and Optimization
- Add comprehensive error handling
- Implement gas optimization strategies
- Add contract upgrade mechanisms
- Perform security audits

---

## Deployment to Production

### 1. Make It Yours - Customize the UI

Before deploying, this is your chance to make the dApp truly yours! The current UI is functional, but you can make it shine:

**Styling Tweaks You Can Make:**
- Update colors in `tailwind.config.js` to match your brand
- Modify the campaign cards in `frontend/src/components/campaign-card.tsx` - maybe add images or different layouts
- Customize the create campaign form styling in `frontend/src/components/create-campaign-form.tsx`
- Add your own logo and branding to the header
- Change fonts, spacing, or add animations to make it more engaging

**Feature Ideas to Add:**
- Campaign categories (charity, tech, art, etc.)
- Image uploads for campaigns (using IPFS)
- Social sharing buttons
- Progress animations
- Campaign search and filtering
- User profiles showing contribution history

Take some time to browse through the components and make them reflect your vision. The beauty of having the full source code is that you can customize everything!

### 2. Deploy to Vercel - Share Your Creation

Once you're happy with your customizations, let's get your dApp live for the world to see:

#### Step 1: Prepare for Deployment
```bash
cd frontend

# Make sure everything builds correctly
npm run build

# Test the production build locally (optional)
npm run preview
```

**🔧 If you encounter TypeScript errors during build:**

The project has been updated to handle common TypeScript issues:

- **Revive API calls**: Now properly typed with `(api.tx.Revive as any)` and `(api.query.Revive as any)`
- **Unused variables**: Cleaned up to remove build warnings
- **Contract interactions**: All contract calls include proper error handling and loading states
- **Toast notifications**: Comprehensive user feedback for all operations

If you still encounter issues:
- Make sure you've run `npm run codegen` after building contracts
- Check that your contract addresses in `constants.ts` are correct
- Verify your `.papi/` directory contains the generated descriptors

The codebase now includes production-ready error handling and user experience improvements!

#### Step 2: Deploy to Vercel

**Option A: Deploy via Vercel CLI (Recommended)**
```bash
# Install Vercel CLI if you haven't already
npm install -g vercel

# IMPORTANT: Navigate to the frontend directory first!
cd frontend
vercel --prod

# Follow the prompts:
# - Link to existing project? No (for first deployment)
# - What's your project name? inkfundme-yourname
# - In which directory is your code located? ./ (just dot slash, since you're already in frontend)
# - Want to override settings? No
```

**⚠️ Common Deployment Issue**: If you get an error like "files should NOT have more than 15000 items", it means you're trying to deploy from the wrong directory. Make sure you're in the `frontend` folder before running `vercel`, not the root project folder!

**Option B: Deploy via Vercel Dashboard**
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "New Project" and import your GitHub repository
4. Set the root directory to `frontend`
5. Vercel will auto-detect it's a Vite project
6. Click "Deploy"

#### Step 3: Configure Environment Variables (if needed)

If you have any environment variables (like API keys), add them in your Vercel dashboard:
- Go to your project settings
- Navigate to "Environment Variables"
- Add any variables your app needs

#### Step 4: Custom Domain (Optional)

Want a custom domain like `mycrowdfunding.com`?
- Go to your Vercel project settings
- Click "Domains"
- Add your custom domain and follow the DNS setup instructions

### 3. Share Your Success

Once deployed, you'll get a URL like `https://inkfundme-yourname.vercel.app`. Now you can:

- Share it with friends and family
- Post it on social media
- Add it to your portfolio
- Use it as a real crowdfunding platform!

**Pro Tips for Going Live:**
- Test all functionality on the live site before sharing widely
- Make sure your contract addresses in `constants.ts` are correct for Passet Hub testnet
- Consider adding analytics (like Google Analytics) to track usage
- Set up error monitoring (like Sentry) to catch any issues

### 4. Contract Deployment Considerations

Your contracts are already deployed on Passet Hub testnet, which is perfect for demonstration and testing. For a production mainnet deployment:

1. **Thoroughly test everything** on testnets first
2. **Get a security audit** - never deploy unaudited contracts with real money
3. **Deploy with proper access controls** - consider multi-sig wallets for admin functions
4. **Set up monitoring** - track contract events and unusual activity
5. **Have an emergency plan** - know how to pause or upgrade if needed

But for now, the testnet deployment is perfect for showcasing your skills and letting people try out your dApp risk-free!

---

## Troubleshooting Common Issues

### 1. Contract Call Failures
- Ensure wallet is connected and has sufficient balance
- Check contract addresses are correct
- Verify function parameters match contract expectations

### 2. Type Errors
- Ensure U256 values are properly formatted as arrays
- Check address format conversions
- Verify TypeScript types match contract definitions

### 3. Transaction Failures
- Check gas limits and fees
- Ensure proper token approvals for transfers
- Verify contract state allows the operation

---

## Resources and Further Reading

- [ink! Documentation](https://use.ink/)
- [Polkadot API (PAPI) Documentation](https://papi.how/)
- [ReactiveDOT Documentation](https://reactivedot.dev/)
- [Substrate Contracts Node](https://github.com/paritytech/substrate-contracts-node)
- [Source Code Repository](https://github.com/truthixify/inkfundme)

---

## Conclusion

Congratulations! You've built a complete decentralized crowdfunding platform using ink! smart contracts and modern frontend technologies. You now understand how to:

- Design and implement ink! smart contracts
- Generate TypeScript bindings with PAPI
- Build reactive library for the front-ends with ReactiveDOT (This is built on top of PAPI)
- Handle complex blockchain interactions
- Deploy and test dApps

This is just the beginning. The patterns and techniques you've learned here can be applied to build all kinds of decentralized applications. Keep experimenting, keep building, and most importantly, keep learning!

The future of decentralized applications is bright, and you're now equipped to be part of it. Happy coding! 🚀