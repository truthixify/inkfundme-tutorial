#![cfg_attr(not(feature = "std"), no_std, no_main)]

pub use token::*;

#[ink::contract]
pub mod token {
    use ink::{prelude::string::String, storage::Mapping, U256};

    /// InkFundMe ERC20 Token with minting capabilities
    #[ink(storage)]
    #[derive(Default)]
    pub struct Token {
        /// Total token supply
        total_supply: U256,
        /// Mapping from owner to number of owned tokens
        balances: Mapping<Address, U256>,
        /// Mapping of the token amount which an account is allowed to withdraw
        /// from another account
        allowances: Mapping<(Address, Address), U256>,
        /// Token name
        name: String,
        /// Token symbol
        symbol: String,
        /// Token decimals
        decimals: u8,
    }

    /// Event emitted when a token transfer occurs
    #[ink(event)]
    pub struct Transfer {
        #[ink(topic)]
        from: Option<Address>,
        #[ink(topic)]
        to: Option<Address>,
        value: U256,
    }

    /// Event emitted when an approval occurs that `spender` is allowed to withdraw
    /// up to the amount of `value` tokens from `owner`
    #[ink(event)]
    pub struct Approval {
        #[ink(topic)]
        owner: Address,
        #[ink(topic)]
        spender: Address,
        value: U256,
    }

    /// Event emitted when tokens are minted
    #[ink(event)]
    pub struct Mint {
        #[ink(topic)]
        to: Address,
        value: U256,
    }

    /// The ERC-20 error types
    #[derive(Debug, PartialEq, Eq)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    pub enum Error {
        /// Returned if not enough balance to fulfill a request is available
        InsufficientBalance,
        /// Returned if not enough allowance to fulfill a request is available
        InsufficientAllowance,
        /// Returned when trying to mint would cause overflow
        Overflow,
    }

    /// The ERC-20 result type
    pub type Result<T> = core::result::Result<T, Error>;

    impl Token {
        /// Creates a new InkFundMe ERC-20 token contract
        ///
        /// # Parameters
        /// - `name`: Token name (e.g., "InkFundMe Token")
        /// - `symbol`: Token symbol (e.g., "IFM")
        /// - `decimals`: Number of decimals (typically 18)
        /// - `initial_supply`: Initial token supply (will be minted to deployer)
        #[ink(constructor)]
        pub fn new(name: String, symbol: String, decimals: u8, initial_supply: U256) -> Self {
            let mut balances = Mapping::default();
            let caller = Self::env().caller();

            if initial_supply > U256::zero() {
                balances.insert(caller, &initial_supply);
                Self::env().emit_event(Transfer {
                    from: None,
                    to: Some(caller),
                    value: initial_supply,
                });
            }

            Self {
                total_supply: initial_supply,
                balances,
                allowances: Default::default(),
                name,
                symbol,
                decimals,
            }
        }

        /// Returns the token name
        #[ink(message)]
        pub fn name(&self) -> String {
            self.name.clone()
        }

        /// Returns the token symbol
        #[ink(message)]
        pub fn symbol(&self) -> String {
            self.symbol.clone()
        }

        /// Returns the token decimals
        #[ink(message)]
        pub fn decimals(&self) -> u8 {
            self.decimals
        }

        /// Returns the total token supply
        #[ink(message)]
        pub fn total_supply(&self) -> U256 {
            self.total_supply
        }

        /// Returns the account balance for the specified `owner`
        ///
        /// Returns `0` if the account is non-existent
        #[ink(message)]
        pub fn balance_of(&self, owner: Address) -> U256 {
            self.balance_of_impl(&owner)
        }

        /// Returns the account balance for the specified `owner`
        ///
        /// Returns `0` if the account is non-existent
        ///
        /// # Note
        ///
        /// Prefer to call this method over `balance_of` since this
        /// works using references which are more efficient
        #[inline]
        fn balance_of_impl(&self, owner: &Address) -> U256 {
            self.balances.get(owner).unwrap_or_default()
        }

        /// Returns the amount which `spender` is still allowed to withdraw from `owner`
        ///
        /// Returns `0` if no allowance has been set
        #[ink(message)]
        pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
            self.allowance_impl(&owner, &spender)
        }

        /// Returns the amount which `spender` is still allowed to withdraw from `owner`
        ///
        /// Returns `0` if no allowance has been set
        ///
        /// # Note
        ///
        /// Prefer to call this method over `allowance` since this
        /// works using references which are more efficient
        #[inline]
        fn allowance_impl(&self, owner: &Address, spender: &Address) -> U256 {
            self.allowances.get((owner, spender)).unwrap_or_default()
        }

        /// Transfers `value` amount of tokens from the caller's account to account `to`
        ///
        /// On success a `Transfer` event is emitted
        ///
        /// # Errors
        ///
        /// Returns `InsufficientBalance` error if there are not enough tokens on
        /// the caller's account balance
        #[ink(message)]
        pub fn transfer(&mut self, to: Address, value: U256) -> Result<()> {
            let from = self.env().caller();
            self.transfer_from_to(&from, &to, value)
        }

        /// Allows `spender` to withdraw from the caller's account multiple times, up to
        /// the `value` amount
        ///
        /// If this function is called again it overwrites the current allowance with
        /// `value`
        ///
        /// An `Approval` event is emitted
        #[ink(message)]
        pub fn approve(&mut self, spender: Address, value: U256) -> Result<()> {
            let owner = self.env().caller();
            self.allowances.insert((&owner, &spender), &value);
            self.env().emit_event(Approval {
                owner,
                spender,
                value,
            });
            Ok(())
        }

        /// Transfers `value` tokens on the behalf of `from` to the account `to`
        ///
        /// This can be used to allow a contract to transfer tokens on ones behalf and/or
        /// to charge fees in sub-currencies, for example
        ///
        /// On success a `Transfer` event is emitted
        ///
        /// # Errors
        ///
        /// Returns `InsufficientAllowance` error if there are not enough tokens allowed
        /// for the caller to withdraw from `from`
        ///
        /// Returns `InsufficientBalance` error if there are not enough tokens on
        /// the account balance of `from`
        #[ink(message)]
        pub fn transfer_from(&mut self, from: Address, to: Address, value: U256) -> Result<()> {
            let caller = self.env().caller();
            let allowance = self.allowance_impl(&from, &caller);
            if allowance < value {
                return Err(Error::InsufficientAllowance);
            }
            self.transfer_from_to(&from, &to, value)?;
            // We checked that allowance >= value
            #[allow(clippy::arithmetic_side_effects)]
            self.allowances
                .insert((&from, &caller), &(allowance - value));
            Ok(())
        }

        /// Mint new tokens to the specified address
        ///
        /// This is a public function that can be called by anyone for faucet functionality
        /// In a production environment, you might want to add access controls
        ///
        /// # Parameters
        /// - `to`: Address to mint tokens to
        /// - `amount`: Amount of tokens to mint
        ///
        /// # Errors
        ///
        /// Returns `Overflow` error if minting would cause total supply overflow
        #[ink(message)]
        pub fn mint(&mut self, to: Address, amount: U256) -> Result<()> {
            // Check for overflow in total supply
            let new_total_supply = self
                .total_supply
                .checked_add(amount)
                .ok_or(Error::Overflow)?;

            // Update total supply
            self.total_supply = new_total_supply;

            // Update recipient balance
            let to_balance = self.balance_of_impl(&to);
            let new_balance = to_balance.checked_add(amount).ok_or(Error::Overflow)?;
            self.balances.insert(&to, &new_balance);

            // Emit events
            self.env().emit_event(Transfer {
                from: None,
                to: Some(to),
                value: amount,
            });

            self.env().emit_event(Mint { to, value: amount });

            Ok(())
        }

        /// Internal transfer function
        ///
        /// Transfers `value` amount of tokens from `from` to `to`
        ///
        /// On success a `Transfer` event is emitted
        ///
        /// # Errors
        ///
        /// Returns `InsufficientBalance` error if there are not enough tokens on
        /// the `from` account balance
        fn transfer_from_to(&mut self, from: &Address, to: &Address, value: U256) -> Result<()> {
            let from_balance = self.balance_of_impl(from);
            if from_balance < value {
                return Err(Error::InsufficientBalance);
            }

            // We checked that from_balance >= value
            #[allow(clippy::arithmetic_side_effects)]
            self.balances.insert(from, &(from_balance - value));

            let to_balance = self.balance_of_impl(to);
            let new_to_balance = to_balance.checked_add(value).ok_or(Error::Overflow)?;
            self.balances.insert(to, &new_to_balance);

            self.env().emit_event(Transfer {
                from: Some(*from),
                to: Some(*to),
                value,
            });
            Ok(())
        }

        #[ink(message)]
        pub fn address(&self) -> Address {
            self.env().address()
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn set_caller(sender: Address) {
            ink::env::test::set_caller(sender);
        }

        #[ink::test]
        fn new_works() {
            let name = String::from("InkFundMe Token");
            let symbol = String::from("IFM");
            let decimals = 18;
            let initial_supply = U256::from(1000000);

            set_caller(Address::from([0x01; 20]));
            let token = Token::new(name.clone(), symbol.clone(), decimals, initial_supply);

            assert_eq!(token.name(), name);
            assert_eq!(token.symbol(), symbol);
            assert_eq!(token.decimals(), decimals);
            assert_eq!(token.total_supply(), initial_supply);
            assert_eq!(token.balance_of(Address::from([0x01; 20])), initial_supply);
        }

        #[ink::test]
        fn mint_works() {
            let mut token = Token::new(
                String::from("Test Token"),
                String::from("TEST"),
                18,
                U256::from(1000),
            );

            let recipient = Address::from([0x02; 20]);
            let mint_amount = U256::from(500);

            let result = token.mint(recipient, mint_amount);
            assert!(result.is_ok());

            assert_eq!(token.balance_of(recipient), mint_amount);
            assert_eq!(token.total_supply(), U256::from(1500));
        }

        #[ink::test]
        fn transfer_works() {
            set_caller(Address::from([0x01; 20]));
            let mut token = Token::new(
                String::from("Test Token"),
                String::from("TEST"),
                18,
                U256::from(1000),
            );

            let recipient = Address::from([0x02; 20]);
            let transfer_amount = U256::from(100);

            let result = token.transfer(recipient, transfer_amount);
            assert!(result.is_ok());

            assert_eq!(token.balance_of(Address::from([0x01; 20])), U256::from(900));
            assert_eq!(token.balance_of(recipient), transfer_amount);
        }

        #[ink::test]
        fn transfer_insufficient_balance_fails() {
            set_caller(Address::from([0x01; 20]));
            let mut token = Token::new(
                String::from("Test Token"),
                String::from("TEST"),
                18,
                U256::from(100),
            );

            let recipient = Address::from([0x02; 20]);
            let transfer_amount = U256::from(200); // More than balance

            let result = token.transfer(recipient, transfer_amount);
            assert_eq!(result, Err(Error::InsufficientBalance));
        }

        #[ink::test]
        fn approve_and_transfer_from_works() {
            let owner = Address::from([0x01; 20]);
            let spender = Address::from([0x02; 20]);
            let recipient = Address::from([0x03; 20]);

            set_caller(owner);
            let mut token = Token::new(
                String::from("Test Token"),
                String::from("TEST"),
                18,
                U256::from(1000),
            );

            // Owner approves spender
            let approve_amount = U256::from(200);
            let result = token.approve(spender, approve_amount);
            assert!(result.is_ok());
            assert_eq!(token.allowance(owner, spender), approve_amount);

            // Spender transfers from owner to recipient
            set_caller(spender);
            let transfer_amount = U256::from(100);
            let result = token.transfer_from(owner, recipient, transfer_amount);
            assert!(result.is_ok());

            assert_eq!(token.balance_of(owner), U256::from(900));
            assert_eq!(token.balance_of(recipient), transfer_amount);
            assert_eq!(token.allowance(owner, spender), U256::from(100));
        }
    }
}
