""

import { ChainProvider, ReactiveDotProvider, SignerProvider } from "@reactive-dot/react"
import { type ReactNode, Suspense, useState } from "react"
import { WalletDropdown } from "./wallet-dropdown"
import { config } from "../lib/config"
import type { ChainId, WalletAccount } from "../lib/types"
import { Link } from "react-router-dom"

export function WalletProviders({ children }: { children: ReactNode }) {
    const [account, setAccount] = useState<WalletAccount>()
    const [chainId, setChainId] = useState<ChainId>("passetHub")

    return (
        <ReactiveDotProvider config={config}>
            <SignerProvider signer={account?.polkadotSigner}>
                <ChainProvider chainId={chainId}>
                    <div className="min-h-screen">
                        {/* Top Navigation */}
                        <div className="sticky top-0 right-0 left-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                            <div className="flex h-14 items-center justify-between px-4">
                                <Link className="font-semibold" to="/">
                                    Ink!FundMe
                                </Link>
                                <Suspense
                                    fallback={
                                        <div className="text-center text-sm text-muted-foreground">
                                            Loading...
                                        </div>
                                    }
                                >
                                    <WalletDropdown
                                        account={account}
                                        setAccount={setAccount}
                                        chainId={chainId}
                                        setChainId={setChainId}
                                    />
                                </Suspense>
                            </div>
                        </div>

                        {/* Page Content */}
                        <main className="flex justify-center py-8">{children}</main>
                    </div>
                </ChainProvider>
            </SignerProvider>
        </ReactiveDotProvider>
    )
}
