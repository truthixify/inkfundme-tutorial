#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod inkfundme {
    use ink::env::call::FromAddr;
    use ink::{
        U256,
        prelude::string::String,
        prelude::vec::Vec,
        storage::{
            traits::StorageLayout,
            {Mapping, StorageVec},
        },
    };
    use token::{Error as TokenError, TokenRef};

    /// Campaign structure containing all campaign details
    #[derive(Clone, Debug, PartialEq, Eq)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    #[cfg_attr(feature = "std", derive(StorageLayout))]
    pub struct Campaign {
        pub id: u32,
        pub title: String,
        pub description: String,
        pub goal: U256,
        pub deadline: u64,
        pub owner: Address,
        pub raised: U256,
        pub completed: bool,
    }

    /// Main InkFundMe contract storage
    #[ink(storage)]
    pub struct InkFundMe {
        /// Address of the deployed ERC20 token contract
        token_contract: TokenRef,
        /// Vector storing all campaigns
        campaigns: StorageVec<Campaign>,
        /// Mapping to track contributions: (campaign_id, contributor) -> amount
        contributions: Mapping<(u32, Address), U256>,
        /// Counter for generating unique campaign IDs
        next_campaign_id: u32,
    }

    /// Events emitted by the contract
    #[ink(event)]
    pub struct CampaignCreated {
        #[ink(topic)]
        id: u32,
        #[ink(topic)]
        owner: Address,
        goal: U256,
        deadline: u64,
    }

    #[ink(event)]
    pub struct ContributionMade {
        #[ink(topic)]
        campaign_id: u32,
        #[ink(topic)]
        contributor: Address,
        amount: U256,
    }

    #[ink(event)]
    pub struct CampaignFinalized {
        #[ink(topic)]
        campaign_id: u32,
        success: bool,
    }

    #[ink(event)]
    pub struct RefundClaimed {
        #[ink(topic)]
        campaign_id: u32,
        #[ink(topic)]
        contributor: Address,
        amount: U256,
    }

    /// InkFundMe contract errors
    #[derive(Debug, PartialEq, Eq)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    pub enum Error {
        /// Campaign not found
        CampaignNotFound,
        /// Campaign deadline has not passed yet
        DeadlineNotReached,
        /// Campaign deadline has already passed
        DeadlineReached,
        /// Campaign is already completed
        CampaignCompleted,
        /// Campaign goal not met
        GoalNotMet,
        /// No contribution found for refund
        NoContribution,
        /// Only campaign owner can perform this action
        OnlyOwner,
        /// ERC20 token operation failed
        TokenError(TokenError),
        /// Invalid campaign parameters
        InvalidParameters,
    }

    /// Result type for contract operations
    pub type Result<T> = core::result::Result<T, Error>;

    impl From<TokenError> for Error {
        fn from(error: TokenError) -> Self {
            Error::TokenError(error)
        }
    }

    impl InkFundMe {
        /// Alternative constructor that accepts an existing ERC20 token address
        ///
        /// # Parameters
        /// - `token_address`: Address of an existing ERC20 token contract
        ///
        /// # Returns
        /// New InkFundMe contract instance using the provided token
        #[ink(constructor)]
        pub fn new(token_address: Address) -> Self {
            let token_contract = TokenRef::from_addr(token_address);

            Self {
                token_contract,
                campaigns: StorageVec::new(),
                contributions: Mapping::new(),
                next_campaign_id: 0,
            }
        }

        /// Mint tokens for free (faucet functionality for testing)
        ///
        /// # Parameters
        /// - `to`: Address to mint tokens to
        /// - `amount`: Amount of tokens to mint
        ///
        /// # Returns
        /// Result indicating success or failure
        #[ink(message)]
        pub fn mint_faucet(&mut self, amount: U256) -> Result<()> {
            let to = self.env().caller();
            // Cross-contract call to mint tokens
            Ok(self.token_contract.mint(to, amount)?)
        }

        /// Create a new fundraising campaign
        ///
        /// # Parameters
        /// - `title`: Campaign title
        /// - `description`: Campaign description
        /// - `goal`: Fundraising goal in tokens
        /// - `deadline`: Campaign deadline (timestamp)
        ///
        /// # Returns
        /// Campaign ID of the newly created campaign
        #[ink(message)]
        pub fn create_campaign(
            &mut self,
            title: String,
            description: String,
            goal: U256,
            deadline: u64,
        ) -> Result<u32> {
            // Validate parameters
            if goal == U256::zero() || deadline <= self.env().block_timestamp() {
                return Err(Error::InvalidParameters);
            }

            let campaign_id = self.next_campaign_id;
            let owner = self.env().caller();

            let campaign = Campaign {
                id: campaign_id,
                title,
                description,
                goal,
                deadline,
                owner,
                raised: U256::zero(),
                completed: false,
            };

            self.campaigns.push(&campaign);
            self.next_campaign_id += 1;

            // Emit event
            self.env().emit_event(CampaignCreated {
                id: campaign_id,
                owner,
                goal,
                deadline,
            });

            Ok(campaign_id)
        }

        /// Contribute tokens to a campaign
        ///
        /// # Parameters
        /// - `campaign_id`: ID of the campaign to contribute to
        /// - `amount`: Amount of tokens to contribute
        ///
        /// # Returns
        /// Result indicating success or failure
        #[ink(message)]
        pub fn contribute(&mut self, campaign_id: u32, amount: U256) -> Result<()> {
            // Get campaign (this will fail if campaign doesn't exist)
            let mut campaign = self.get_campaign_mut(campaign_id)?;

            // Check if deadline has passed
            if self.env().block_timestamp() > campaign.deadline {
                return Err(Error::DeadlineReached);
            }

            // Check if campaign is already completed
            if campaign.completed {
                return Err(Error::CampaignCompleted);
            }

            let contributor = self.env().caller();
            let contract_address = self.env().address();

            // Transfer tokens from contributor to this contract
            self.token_contract
                .transfer_from(contributor, contract_address, amount)?;

            // Update campaign raised amount
            campaign.raised = campaign.raised.checked_add(amount).unwrap();

            // Update contributor's contribution
            let current_contribution = self
                .contributions
                .get((campaign_id, contributor))
                .unwrap_or_default();
            let new_contribution = current_contribution.checked_add(amount).unwrap();
            self.contributions
                .insert((campaign_id, contributor), &new_contribution);

            // Update the campaign in storage
            self.campaigns.set(campaign_id, &campaign);

            // Emit event
            self.env().emit_event(ContributionMade {
                campaign_id,
                contributor,
                amount,
            });

            Ok(())
        }

        /// Finalize a campaign (transfer funds to owner or mark as failed)
        ///
        /// # Parameters
        /// - `campaign_id`: ID of the campaign to finalize
        ///
        /// # Returns
        /// Result indicating success or failure
        #[ink(message)]
        pub fn finalize(&mut self, campaign_id: u32) -> Result<()> {
            let mut campaign = self.get_campaign_mut(campaign_id)?;

            // Only the campaign owner can finalize
            let caller = self.env().caller();
            if caller != campaign.owner {
                return Err(Error::OnlyOwner);
            }

            // Check if deadline has passed
            if self.env().block_timestamp() <= campaign.deadline {
                return Err(Error::DeadlineNotReached);
            }

            // Check if campaign is already completed
            if campaign.completed {
                return Err(Error::CampaignCompleted);
            }

            let success = campaign.raised >= campaign.goal;
            campaign.completed = true;

            if success {
                // Transfer raised funds to campaign owner
                self.token_contract
                    .transfer(campaign.owner, campaign.raised)?;
            }
            // If not successful, funds remain in contract for refunds

            // Update the campaign in storage
            self.campaigns.set(campaign_id, &campaign);

            // Emit event
            self.env().emit_event(CampaignFinalized {
                campaign_id,
                success,
            });

            Ok(())
        }

        /// Claim refund for a failed campaign
        ///
        /// # Parameters
        /// - `campaign_id`: ID of the failed campaign
        ///
        /// # Returns
        /// Result indicating success or failure
        #[ink(message)]
        pub fn claim_refund(&mut self, campaign_id: u32) -> Result<()> {
            let campaign = self.get_campaign(campaign_id)?;
            let contributor = self.env().caller();

            // Check if campaign is completed and failed
            if !campaign.completed {
                return Err(Error::CampaignCompleted);
            }

            if campaign.raised >= campaign.goal {
                return Err(Error::GoalNotMet);
            }

            // Get contributor's contribution
            let contribution = self
                .contributions
                .get((campaign_id, contributor))
                .unwrap_or_default();

            if contribution == U256::zero() {
                return Err(Error::NoContribution);
            }

            // Remove contribution from mapping
            self.contributions.remove((campaign_id, contributor));

            // Transfer refund to contributor
            self.token_contract.transfer(contributor, contribution)?;

            // Emit event
            self.env().emit_event(RefundClaimed {
                campaign_id,
                contributor,
                amount: contribution,
            });

            Ok(())
        }

        /// Get campaign details by ID
        ///
        /// # Parameters
        /// - `campaign_id`: ID of the campaign
        ///
        /// # Returns
        /// Campaign details or error if not found
        #[ink(message)]
        pub fn get_campaign(&self, campaign_id: u32) -> Result<Campaign> {
            if campaign_id >= self.campaigns.len() {
                return Err(Error::CampaignNotFound);
            }
            Ok(self.campaigns.get(campaign_id).unwrap())
        }

        /// Get all campaigns
        ///
        /// # Returns
        /// Vector of all campaigns
        #[ink(message)]
        pub fn get_all_campaigns(&self) -> Vec<Campaign> {
            let mut campaigns = Vec::new();

            for i in 0..self.campaigns.len() {
                if let Some(campaign) = self.campaigns.get(i) {
                    campaigns.push(campaign);
                }
            }

            campaigns
        }

        /// Get contributor's contribution amount for a specific campaign
        ///
        /// # Parameters
        /// - `campaign_id`: ID of the campaign
        /// - `contributor`: Address of the contributor
        ///
        /// # Returns
        /// Contribution amount
        #[ink(message)]
        pub fn get_contribution(&self, campaign_id: u32, contributor: Address) -> U256 {
            self.contributions
                .get((campaign_id, contributor))
                .unwrap_or_default()
        }

        /// Get the ERC20 token address
        ///
        /// # Returns
        /// Address of the ERC20 token contract
        #[ink(message)]
        pub fn get_token_address(&self) -> Address {
            self.token_contract.address()
        }

        /// Get total number of campaigns
        ///
        /// # Returns
        /// Total number of campaigns created
        #[ink(message)]
        pub fn get_campaign_count(&self) -> u32 {
            self.campaigns.len()
        }

        /// Helper function to get mutable reference to campaign
        fn get_campaign_mut(&mut self, campaign_id: u32) -> Result<Campaign> {
            if campaign_id >= self.campaigns.len() {
                return Err(Error::CampaignNotFound);
            }
            Ok(self.campaigns.get(campaign_id).unwrap())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn set_caller(sender: Address) {
            ink::env::test::set_caller(sender);
        }

        fn set_block_timestamp(timestamp: u64) {
            ink::env::test::set_block_timestamp::<ink::env::DefaultEnvironment>(timestamp);
        }

        // #[ink::test]
        // fn new_works() {
        //     let token_contract = TokenRef::new(
        //         String::from("Test Token"),
        //         String::from("TEST"),
        //         18,
        //         U256::from(1000),
        //     )
        //     .instantiate();
        //     let token_address = token_contract.address();
        //     let contract = InkFundMe::new(token_address);
        //     assert_eq!(contract.get_campaign_count(), 0);
        //     assert_eq!(contract.get_token_address(), token_address);
        // }

        #[ink::test]
        fn create_campaign_works() {
            let token_address = Address::from([0x42; 20]);
            let mut contract = InkFundMe::new(token_address);

            // Set a current timestamp
            set_block_timestamp(500000000);

            let title = String::from("Test Campaign");
            let description = String::from("A test campaign");
            let goal = U256::from(1000);
            let deadline = 1000000000; // Future timestamp

            let result =
                contract.create_campaign(title.clone(), description.clone(), goal, deadline);
            assert!(result.is_ok());

            let campaign_id = result.unwrap();
            assert_eq!(campaign_id, 0);
            assert_eq!(contract.get_campaign_count(), 1);

            let campaign = contract.get_campaign(campaign_id).unwrap();
            assert_eq!(campaign.title, title);
            assert_eq!(campaign.description, description);
            assert_eq!(campaign.goal, goal);
            assert_eq!(campaign.deadline, deadline);
            assert_eq!(campaign.raised, U256::zero());
            assert!(!campaign.completed);
        }

        #[ink::test]
        fn create_campaign_invalid_parameters() {
            let token_address = Address::from([0x42; 20]);
            let mut contract = InkFundMe::new(token_address);

            // Set a current timestamp
            set_block_timestamp(500000000);

            // Test with zero goal
            let result = contract.create_campaign(
                String::from("Test"),
                String::from("Test"),
                U256::zero(),
                1000000000,
            );
            assert_eq!(result, Err(Error::InvalidParameters));

            // Test with past deadline
            let result = contract.create_campaign(
                String::from("Test"),
                String::from("Test"),
                U256::from(1000),
                0, // Past timestamp
            );
            assert_eq!(result, Err(Error::InvalidParameters));
        }

        #[ink::test]
        fn get_campaign_not_found() {
            let token_address = Address::from([0x42; 20]);
            let contract = InkFundMe::new(token_address);
            let result = contract.get_campaign(0);
            assert_eq!(result, Err(Error::CampaignNotFound));
        }

        #[ink::test]
        fn get_contribution_works() {
            let token_address = Address::from([0x42; 20]);
            let contract = InkFundMe::new(token_address);
            let contributor = Address::from([0x01; 20]);
            let contribution = contract.get_contribution(0, contributor);
            assert_eq!(contribution, U256::zero());
        }

        #[ink::test]
        #[should_panic(expected = "failed getting code hash")]
        fn mint_faucet_cross_contract_call() {
            let token_address = Address::from([0x42; 20]);
            let mut contract = InkFundMe::new(token_address);

            // Set caller
            let caller = Address::from([0x01; 20]);
            set_caller(caller);

            // This test verifies that the mint_faucet function attempts a cross-contract call
            // It will panic because the token address doesn't point to a real contract
            let amount = U256::from(1000);
            let _result = contract.mint_faucet(amount);

            // This line should not be reached due to the panic
        }

        #[ink::test]
        fn get_all_campaigns_works() {
            let token_address = Address::from([0x42; 20]);
            let mut contract = InkFundMe::new(token_address);

            // Initially no campaigns
            let campaigns = contract.get_all_campaigns();
            assert_eq!(campaigns.len(), 0);

            // Set timestamp for campaign creation
            set_block_timestamp(500000000);

            // Create a campaign
            let result = contract.create_campaign(
                String::from("Test Campaign"),
                String::from("Description"),
                U256::from(1000),
                1000000000,
            );
            assert!(result.is_ok());

            // Now should have one campaign
            let campaigns = contract.get_all_campaigns();
            assert_eq!(campaigns.len(), 1);
            assert_eq!(campaigns[0].title, "Test Campaign");
        }

        #[ink::test]
        fn multiple_campaigns_work() {
            let token_address = Address::from([0x42; 20]);
            let mut contract = InkFundMe::new(token_address);

            // Set timestamp
            set_block_timestamp(500000000);

            // Create multiple campaigns
            for i in 0..3 {
                let result = contract.create_campaign(
                    format!("Campaign {}", i),
                    format!("Description {}", i),
                    U256::from(1000 + i as u128),
                    1000000000 + i as u64,
                );
                assert!(result.is_ok());
                assert_eq!(result.unwrap(), i as u32);
            }

            assert_eq!(contract.get_campaign_count(), 3);

            // Check each campaign
            for i in 0..3 {
                let campaign = contract.get_campaign(i as u32).unwrap();
                assert_eq!(campaign.title, format!("Campaign {}", i));
                assert_eq!(campaign.goal, U256::from(1000 + i as u128));
            }
        }
    }
}
