import {
    useAccounts,
    useConnectedWallets,
    useWalletConnector,
    useWalletDisconnector,
    useWallets,
} from "@reactive-dot/react"
import { ChevronDownIcon, LinkIcon, UnlinkIcon, WalletIcon } from "lucide-react"
import { Suspense, useCallback, useEffect } from "react"
import { toast } from "sonner"
import type { ChainId, Wallet, WalletAccount } from "../lib/types"
import { Button } from "./ui/button-extended"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { AccountBalance } from "./account-balance"
import { AccountSelect } from "./account-select"
import { MapAccountButton } from "./map-account-button"

interface WalletDropdownProps {
    account: WalletAccount | undefined
    setAccount: (account: WalletAccount | undefined) => void
    chainId?: ChainId
    setChainId?: (chainId: ChainId) => void
}

export function WalletDropdown({ account, setAccount }: WalletDropdownProps) {
    const accounts = useAccounts()
    const wallets = useWallets()
    const connectedWallets = useConnectedWallets()

    const connectWallet = useWalletConnector()[1]
    const disconnectWallet = useWalletDisconnector()[1]

    useEffect(() => {
        if (!account && accounts && accounts.length > 0) {
            setAccount(accounts[0])
        }
    }, [accounts])

    const handleConnect = useCallback(
        async (wallet?: Wallet) => {
            if (!wallets?.length) return
            toast.promise(connectWallet(wallet ?? wallets[0]), {
                loading: "Connecting to wallet...",
                success: "Wallet connected",
                error: "Failed to connect to wallet",
            })
        },
        [connectWallet, wallets]
    )

    const handleDisconnect = useCallback(async () => {
        if (!connectedWallets?.length) return

        toast.promise(disconnectWallet(), {
            loading: "Disconnecting from wallet...",
            success: "Wallet disconnected",
            error: "Failed to disconnect from wallet",
        })
    }, [disconnectWallet, connectedWallets])

    const selectedAccount = account ?? (accounts && accounts[0])

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className="gap-2 min-w-[180px]"
                    onClick={() => {
                        if (!accounts?.length && wallets?.length) {
                            handleConnect()
                        }
                    }}
                >
                    <WalletIcon className="h-4 w-4" />
                    {selectedAccount ? selectedAccount.name : "Connect Wallet"}
                    {selectedAccount && <ChevronDownIcon className="h-4 w-4" />}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-[220px] rounded-xl p-4"
            >
                <div className="w-full space-y-4">
                    {!accounts || accounts.length === 0 ? (
                        <div className="space-y-2">
                            {!wallets?.length ? (
                                <div className="text-sm text-muted-foreground">
                                    No wallets found
                                </div>
                            ) : (
                                wallets.map((wallet) => (
                                    <DropdownMenuItem
                                        key={wallet.id}
                                        onClick={() => handleConnect(wallet)}
                                        className="justify-start rounded-lg"
                                    >
                                        <LinkIcon className="mr-2" /> {wallet.name}
                                    </DropdownMenuItem>
                                ))
                            )}

                            {/* If already connected wallets exist (but no accounts), allow disconnect */}
                            {connectedWallets?.length ? (
                                <>
                                    <DropdownMenuSeparator className="my-2" />
                                    <DropdownMenuItem
                                        onClick={() => handleDisconnect()}
                                        className="justify-center rounded-lg text-sm"
                                    >
                                        <UnlinkIcon className="mr-2" /> Disconnect wallet(s)
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            <div className="w-full space-y-2">
                                <Suspense
                                    fallback={
                                        <div className="text-center text-sm text-muted-foreground">
                                            Loading...
                                        </div>
                                    }
                                >
                                    <AccountSelect
                                        account={selectedAccount}
                                        setAccount={setAccount}
                                    />
                                </Suspense>
                            </div>

                            <DropdownMenuSeparator className="my-3" />

                            <div className="space-y-2">
                                <Suspense
                                    fallback={
                                        <div className="text-center text-sm text-muted-foreground">
                                            Loading...
                                        </div>
                                    }
                                >
                                    <AccountBalance />
                                </Suspense>
                            </div>

                            <div className="space-y-2">
                                <Suspense
                                    fallback={
                                        <div className="text-center text-sm text-muted-foreground">
                                            Loading...
                                        </div>
                                    }
                                >
                                    <MapAccountButton />
                                </Suspense>
                            </div>

                            <DropdownMenuSeparator className="my-3" />
                        </>
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
