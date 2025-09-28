import { passetHub } from "@polkadot-api/descriptors"
import { defineConfig } from "@reactive-dot/core"
import { InjectedWalletProvider } from "@reactive-dot/core/wallets.js"
import { getWsProvider } from "polkadot-api/ws-provider/web"

export const config = defineConfig({
    chains: {
        passetHub: {
            descriptor: passetHub,
            provider: getWsProvider("wss://testnet-passet-hub.polkadot.io"),
        },
        // Add more chains here
    },
    ssr: true,
    wallets: [new InjectedWalletProvider()],
})
