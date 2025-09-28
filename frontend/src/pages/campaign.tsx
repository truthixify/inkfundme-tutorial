import { createReviveSdk, type ReviveSdkTypedApi, ss58ToEthereum } from "@polkadot-api/sdk-ink"
import { useChainId, useTypedApi } from "@reactive-dot/react"
import { formatDistanceToNowStrict } from "date-fns"
import {
    ArrowLeftIcon,
    CalendarIcon,
    CheckCircleIcon,
    ClockIcon,
    CoinsIcon,
    TrendingUpIcon,
    UsersIcon,
    XCircleIcon,
} from "lucide-react"
import { type FixedSizeArray, FixedSizeBinary } from "polkadot-api"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button-extended"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Progress } from "../components/ui/progress"
import { Separator } from "../components/ui/separator"
import { useSignerAndAddress } from "../hooks/use-signer-and-address"
import { ALICE, INK_FUND_ME_ADDRESS, TOKEN_ADDRESS } from "../lib/constants"
import { inkFundMe, token } from "../lib/contracts"
import { formatAddress } from "../lib/utils"
import { useParams } from "react-router-dom"
import { LoadingScreen } from "../components/ui/loading"

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

type TokenInfo = {
    name: string
    symbol: string
    decimals: number
    totalSupply: FixedSizeArray<4, bigint>
    userBalance: FixedSizeArray<4, bigint>
}

export default function CampaignPage() {
    const { id } = useParams<{ id: string }>()
    const campaignId = Number.parseInt(id || "0", 10)

    const [campaign, setCampaign] = useState<Campaign | null>(null)
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
    const [initialLoading, setInitialLoading] = useState(true)
    const [contributionAmount, setContributionAmount] = useState("")
    const [isContributing, setIsContributing] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [isFinalizing, setIsFinalizing] = useState(false)
    const [isClaiming, setIsClaiming] = useState(false)
    const [isMinting, setIsMinting] = useState(false)
    const [userContribution, setUserContribution] = useState<bigint>(0n)
    const [allowance, setAllowance] = useState<FixedSizeArray<4, bigint>>([0n, 0n, 0n, 0n])
    const [isInitialLoad, setIsInitialLoad] = useState(true)

    const api = useTypedApi()
    const chain = useChainId()
    const { signer, signerAddress } = useSignerAndAddress()

    // Helper functions
    const formatTokenAmount = (
        amount: FixedSizeArray<4, bigint>,
        decimals: number | undefined
    ): string => {
        if (!amount) return "0"

        const value = amount[0] || 0n
        const divisor = 10n ** BigInt(decimals || 0)
        const wholePart = value / divisor
        const fractionalPart = value % divisor

        if (fractionalPart === 0n) {
            return wholePart.toString()
        }

        const fractionalStr = fractionalPart.toString().padStart(decimals || 0, "0")
        const trimmedFractional = fractionalStr.replace(/0+$/, "")

        return trimmedFractional ? `${wholePart}.${trimmedFractional}` : wholePart.toString()
    }

    const calculateProgress = (
        raised: FixedSizeArray<4, bigint>,
        goal: FixedSizeArray<4, bigint>
    ): number => {
        const raisedValue = raised[0] || 0n
        const goalValue = goal[0] || 1n

        if (goalValue === 0n) return 0

        const percentage = Number((raisedValue * 100n) / goalValue)
        return Math.min(percentage, 100)
    }

    const formatDeadline = (timestamp: bigint): string => {
        const date = new Date(Number(timestamp) * 1000)
        return date.toLocaleDateString()
    }

    // Load campaign, token data, and allowance
    const loadData = useCallback(
        async (isRefresh = false) => {
            if (!api || !chain) return

            if (isInitialLoad && !isRefresh) {
                setInitialLoading(true)
            }

            try {
                // --- InkFundMe setup ---
                const inkFundMeSdk = createReviveSdk(api as ReviveSdkTypedApi, inkFundMe.contract)

                if (!INK_FUND_ME_ADDRESS) return
                const inkFundMeContract = inkFundMeSdk.getContract(INK_FUND_ME_ADDRESS)

                // --- Load campaign data ---
                const campaignResult = await inkFundMeContract.query("get_campaign", {
                    origin: signerAddress || ALICE,
                    data: { campaign_id: campaignId },
                })
                if (campaignResult.success) {
                    setCampaign(campaignResult.value.response)
                }

                // --- Load user contribution (only if signed in) ---
                if (signerAddress) {
                    const contributionResult = await inkFundMeContract.query("get_contribution", {
                        origin: signerAddress,
                        data: {
                            campaign_id: campaignId,
                            contributor: ss58ToEthereum(signerAddress),
                        },
                    })
                    if (contributionResult.success) {
                        setUserContribution(contributionResult.value.response[0] || 0n)
                    }
                } else {
                    setUserContribution(0n)
                }

                // --- Token setup ---
                const tokenSdk = createReviveSdk(api as ReviveSdkTypedApi, token.contract)

                if (!TOKEN_ADDRESS) return
                const tokenContract = tokenSdk.getContract(TOKEN_ADDRESS)

                // --- Always load base token info ---
                const [nameResult, symbolResult, decimalsResult, totalSupplyResult] =
                    await Promise.all([
                        tokenContract.query("name", { origin: signerAddress || ALICE }),
                        tokenContract.query("symbol", { origin: signerAddress || ALICE }),
                        tokenContract.query("decimals", { origin: signerAddress || ALICE }),
                        tokenContract.query("total_supply", { origin: signerAddress || ALICE }),
                    ])

                // --- Defaults for user-specific info ---
                let userBalance: FixedSizeArray<4, bigint> = [0n, 0n, 0n, 0n]
                let allowanceValue: FixedSizeArray<4, bigint> = [0n, 0n, 0n, 0n]

                // --- Only query balance + allowance if wallet connected ---
                if (signerAddress) {
                    const [balanceResult, allowanceResult] = await Promise.all([
                        tokenContract.query("balance_of", {
                            origin: signerAddress,
                            data: { owner: ss58ToEthereum(signerAddress) },
                        }),
                        tokenContract.query("allowance", {
                            origin: signerAddress,
                            data: {
                                owner: ss58ToEthereum(signerAddress),
                                spender: FixedSizeBinary.fromHex(INK_FUND_ME_ADDRESS),
                            },
                        }),
                    ])

                    if (balanceResult.success) {
                        userBalance = balanceResult.value.response
                    }
                    if (allowanceResult.success) {
                        allowanceValue = allowanceResult.value.response
                    }
                }

                // --- Update tokenInfo state ---
                if (
                    nameResult.success &&
                    symbolResult.success &&
                    decimalsResult.success &&
                    totalSupplyResult.success
                ) {
                    setTokenInfo({
                        name: nameResult.value.response,
                        symbol: symbolResult.value.response,
                        decimals: decimalsResult.value.response,
                        totalSupply: totalSupplyResult.value.response,
                        userBalance,
                    })
                    setAllowance(allowanceValue)
                }
            } catch (error) {
                console.error("Error loading campaign data:", error)
                toast.error("Failed to load campaign data")
            } finally {
                if (isInitialLoad && !isRefresh) {
                    setInitialLoading(false)
                    setIsInitialLoad(false)
                }
            }
        },
        [api, chain, signerAddress, campaignId]
    )

    useEffect(() => {
        loadData()
    }, [loadData])

    // Handle token approval
    const handleApprove = useCallback(async () => {
        if (!api || !chain || !signer || !signerAddress || !contributionAmount || !tokenInfo) return

        setIsApproving(true)
        try {
            const tokenSdk = createReviveSdk(api as ReviveSdkTypedApi, token.contract)

            if (!TOKEN_ADDRESS || !INK_FUND_ME_ADDRESS) {
                toast.error("Contract address not found")
                return
            }
            const tokenContract = tokenSdk.getContract(TOKEN_ADDRESS)

            const isMapped = await tokenSdk.addressIsMapped(signerAddress)
            if (!isMapped) {
                toast.error("Account not mapped. Please map your account first.")
                return
            }

            const parsedAmount = Number.parseFloat(contributionAmount)
            const amountBig = BigInt(Math.round(parsedAmount * 10 ** tokenInfo.decimals))
            const amountU256: FixedSizeArray<4, bigint> = [amountBig, 0n, 0n, 0n]

            const approveTx = tokenContract
                .send("approve", {
                    origin: signerAddress,
                    data: {
                        spender: FixedSizeBinary.fromHex(INK_FUND_ME_ADDRESS),
                        value: amountU256,
                    },
                })
                .signAndSubmit(signer)
                .then((tx) => {
                    if (!tx.ok) throw new Error("Failed to approve", { cause: tx.dispatchError })
                    loadData(true)
                    return tx
                })

            toast.promise(approveTx, {
                loading: `Approving ${parsedAmount} $${tokenInfo.symbol} ...`,
                success: "Successfully approved!",
                error: (error) => {
                    if (
                        error.message.includes("User denied transaction") ||
                        error.message.includes("rejected")
                    ) {
                        return "Transaction canceled by user"
                    }
                    return "Failed to approve"
                },
            })

            await approveTx
        } catch (error: any) {
            console.error("Error approving tokens:", error)
            if (
                error.message.includes("User denied transaction") ||
                error.message.includes("rejected")
            ) {
                toast.error("Transaction canceled by user")
            } else {
                toast.error("Failed to approve tokens")
            }
        } finally {
            setIsApproving(false)
        }
    }, [api, chain, signer, signerAddress, contributionAmount, tokenInfo, loadData])

    // Handle contribution
    const handleContribute = useCallback(async () => {
        if (!api || !chain || !signer || !signerAddress || !contributionAmount || !tokenInfo) return

        setIsContributing(true)
        try {
            const sdk = createReviveSdk(api as ReviveSdkTypedApi, inkFundMe.contract)

            if (!INK_FUND_ME_ADDRESS) {
                toast.error("Contract address not found")
                return
            }
            const contract = sdk.getContract(INK_FUND_ME_ADDRESS)

            const parsedAmount = Number.parseFloat(contributionAmount)
            const amountBig = BigInt(Math.round(parsedAmount * 10 ** tokenInfo.decimals))
            const amountU256: FixedSizeArray<4, bigint> = [amountBig, 0n, 0n, 0n]

            const tx = contract
                .send("contribute", {
                    origin: signerAddress,
                    data: {
                        campaign_id: campaignId,
                        amount: amountU256,
                    },
                })
                .signAndSubmit(signer)
                .then((tx) => {
                    if (!tx.ok) throw new Error("Failed to contribute", { cause: tx.dispatchError })
                    setContributionAmount("")
                    loadData(true)
                    return tx
                })

            toast.promise(tx, {
                loading: `Contributing ${parsedAmount} $${tokenInfo.symbol} to campaign ...`,
                success: "Successfully contributed!",
                error: (error) => {
                    if (
                        error.message.includes("User denied transaction") ||
                        error.message.includes("rejected")
                    ) {
                        return "Transaction canceled by user"
                    }
                    return "Failed to contribute"
                },
            })

            await tx
        } catch (error: any) {
            console.error("Error contributing:", error)
            if (
                error.message.includes("User denied transaction") ||
                error.message.includes("rejected")
            ) {
                toast.error("Transaction canceled by user")
            } else {
                toast.error("Failed to contribute")
            }
        } finally {
            setIsContributing(false)
        }
    }, [api, chain, signer, signerAddress, contributionAmount, campaignId, loadData, tokenInfo])

    // Handle finalize
    const handleFinalize = useCallback(async () => {
        if (!api || !chain || !signer || !signerAddress) return

        setIsFinalizing(true)
        try {
            const sdk = createReviveSdk(api as ReviveSdkTypedApi, inkFundMe.contract)

            if (!INK_FUND_ME_ADDRESS) {
                toast.error("Contract address not found")
                return
            }
            const contract = sdk.getContract(INK_FUND_ME_ADDRESS)

            const isMapped = await sdk.addressIsMapped(signerAddress)
            if (!isMapped) {
                toast.error("Account not mapped. Please map your account first.")
                return
            }

            const tx = contract
                .send("finalize", {
                    origin: signerAddress,
                    data: {
                        campaign_id: campaignId,
                    },
                })
                .signAndSubmit(signer)
                .then((tx) => {
                    if (!tx.ok) throw new Error("Failed to finalize", { cause: tx.dispatchError })
                    loadData(true)
                    return tx
                })

            toast.promise(tx, {
                loading: "Finalizing campaign...",
                success: "Successfully finalized!",
                error: (error) => {
                    if (
                        error.message.includes("User denied transaction") ||
                        error.message.includes("rejected")
                    ) {
                        return "Transaction canceled by user"
                    }
                    return "Failed to finalize"
                },
            })

            await tx
        } catch (error: any) {
            console.error("Error finalizing:", error)
            if (
                error.message.includes("User denied transaction") ||
                error.message.includes("rejected")
            ) {
                toast.error("Transaction canceled by user")
            } else {
                toast.error("Failed to finalize")
            }
        } finally {
            setIsFinalizing(false)
        }
    }, [api, chain, signer, signerAddress, campaignId, loadData])

    // Handle claim refund
    const handleClaimRefund = useCallback(async () => {
        if (!api || !chain || !signer || !signerAddress) return

        setIsClaiming(true)
        try {
            const sdk = createReviveSdk(api as ReviveSdkTypedApi, inkFundMe.contract)

            if (!INK_FUND_ME_ADDRESS) {
                toast.error("Contract address not found")
                return
            }
            const contract = sdk.getContract(INK_FUND_ME_ADDRESS)

            const isMapped = await sdk.addressIsMapped(signerAddress)
            if (!isMapped) {
                toast.error("Account not mapped. Please map your account first.")
                return
            }

            const tx = contract
                .send("claim_refund", {
                    origin: signerAddress,
                    data: {
                        campaign_id: campaignId,
                    },
                })
                .signAndSubmit(signer)
                .then((tx) => {
                    if (!tx.ok)
                        throw new Error("Failed to claim refund", { cause: tx.dispatchError })
                    loadData(true)
                    return tx
                })

            toast.promise(tx, {
                loading: "Claiming refund...",
                success: "Successfully claimed refund!",
                error: (error) => {
                    if (
                        error.message.includes("User denied transaction") ||
                        error.message.includes("rejected")
                    ) {
                        return "Transaction canceled by user"
                    }
                    return "Failed to claim refund"
                },
            })

            await tx
        } catch (error: any) {
            console.error("Error claiming refund:", error)
            if (
                error.message.includes("User denied transaction") ||
                error.message.includes("rejected")
            ) {
                toast.error("Transaction canceled by user")
            } else {
                toast.error("Failed to claim refund")
            }
        } finally {
            setIsClaiming(false)
        }
    }, [api, chain, signer, signerAddress, campaignId, loadData])

    // Mint tokens function
    const handleMintTokens = useCallback(async () => {
        if (!api || !chain || !signer || !signerAddress) return

        setIsMinting(true)
        try {
            const sdk = createReviveSdk(api as ReviveSdkTypedApi, inkFundMe.contract)

            if (!INK_FUND_ME_ADDRESS) {
                toast.error("Contract address not found")
                return
            }
            const contract = sdk.getContract(INK_FUND_ME_ADDRESS)

            const isMapped = await sdk.addressIsMapped(signerAddress)
            if (!isMapped) {
                toast.error("Account not mapped. Please map your account first.")
                return
            }

            const amount: FixedSizeArray<4, bigint> = [1000n, 0n, 0n, 0n]

            const tx = contract
                .send("mint_faucet", {
                    origin: signerAddress,
                    data: { amount },
                })
                .signAndSubmit(signer)
                .then((tx) => {
                    if (!tx.ok)
                        throw new Error("Failed to mint tokens", { cause: tx.dispatchError })
                    loadData(true)
                    return tx
                })

            toast.promise(tx, {
                loading: "Minting tokens...",
                success: "Successfully minted 1000 tokens!",
                error: (error) => {
                    if (
                        error.message.includes("User denied transaction") ||
                        error.message.includes("rejected")
                    ) {
                        return "Transaction canceled by user"
                    }
                    return "Failed to mint tokens"
                },
            })

            await tx
        } catch (error: any) {
            console.error("Error minting tokens:", error)
            if (
                error.message.includes("User denied transaction") ||
                error.message.includes("rejected")
            ) {
                toast.error("Transaction canceled by user")
            } else {
                toast.error("Failed to mint tokens")
            }
        } finally {
            setIsMinting(false)
        }
    }, [api, chain, signer, signerAddress, loadData])

    if (initialLoading) {
        return <LoadingScreen />
    }

    if (!campaign) {
        return (
            <div className="py-12 text-center">
                <h2 className="mb-4 font-bold text-2xl">Campaign Not Found</h2>
                <p className="mb-6 text-muted-foreground">
                    The campaign you're looking for doesn't exist.
                </p>
                <Button onClick={() => window.history.back()}>
                    <ArrowLeftIcon className="mr-2 h-4 w-4" />
                    Go Back
                </Button>
            </div>
        )
    }

    const progress = calculateProgress(campaign.raised, campaign.goal)
    const deadlineDate = new Date(Number(campaign.deadline) * 1000)
    const isExpired = deadlineDate.getTime() < Date.now()
    const goalReached = progress >= 100
    const timeLeft = !isExpired
        ? formatDistanceToNowStrict(deadlineDate, { addSuffix: false })
        : null

    // Check if allowance is sufficient
    let contributionAmountBigInt = 0n
    if (contributionAmount && tokenInfo) {
        const parsedAmount = Number.parseFloat(contributionAmount)
        contributionAmountBigInt = BigInt(Math.round(parsedAmount * 10 ** tokenInfo.decimals))
    }
    const isAllowanceSufficient = contributionAmountBigInt <= (allowance[0] || 0n)

    // Check if user is owner
    const userEvmAddress = signerAddress ? ss58ToEthereum(signerAddress) : null
    const isOwner = userEvmAddress && campaign.owner.asHex() === userEvmAddress.asHex()

    return (
        <div className="min-h-screen">
            <div className="flex justify-center px-8 py-8">
                <div className="mx-auto space-y-6">
                    {/* Back Button */}
                    <Button variant="outline" onClick={() => window.history.back()}>
                        <ArrowLeftIcon className="mr-2 h-4 w-4" />
                        Back to Campaigns
                    </Button>

                    <div className="grid gap-6 lg:grid-cols-3">
                        {/* Main Campaign Info */}
                        <div className="space-y-6 lg:col-span-2">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-2">
                                            <CardTitle className="text-2xl">
                                                {campaign.title}
                                            </CardTitle>
                                            <div className="flex items-center gap-2">
                                                {campaign.completed ? (
                                                    goalReached ? (
                                                        <Badge className="border-green-200 bg-green-100 text-green-700">
                                                            <CheckCircleIcon className="mr-1 h-3 w-3" />
                                                            Successful
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="destructive">
                                                            <XCircleIcon className="mr-1 h-3 w-3" />
                                                            Failed
                                                        </Badge>
                                                    )
                                                ) : isExpired ? (
                                                    <Badge variant="secondary">
                                                        <ClockIcon className="mr-1 h-3 w-3" />
                                                        Expired
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">
                                                        <TrendingUpIcon className="mr-1 h-3 w-3" />
                                                        Active
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <p className="text-muted-foreground leading-relaxed">
                                        {campaign.description}
                                    </p>

                                    {/* Progress Section */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-lg">
                                                Funding Progress
                                            </span>
                                            <span className="font-bold text-lg text-primary">
                                                {progress.toFixed(1)}%
                                            </span>
                                        </div>
                                        <Progress value={progress} className="h-3" />
                                        <div className="flex justify-between text-sm">
                                            <div className="flex items-center gap-1">
                                                <CoinsIcon className="h-4 w-4" />
                                                <span className="font-semibold">
                                                    {formatTokenAmount(
                                                        campaign.raised,
                                                        tokenInfo?.decimals
                                                    )}{" "}
                                                    {tokenInfo?.symbol}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    raised
                                                </span>
                                            </div>
                                            <div className="text-muted-foreground">
                                                Goal:{" "}
                                                {formatTokenAmount(
                                                    campaign.goal,
                                                    tokenInfo?.decimals
                                                )}{" "}
                                                {tokenInfo?.symbol}
                                            </div>
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* Campaign Details */}
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <UsersIcon className="h-4 w-4" />
                                                <span className="font-medium">Creator</span>
                                            </div>
                                            <p className="rounded bg-muted px-3 py-2 font-mono text-sm">
                                                {formatAddress(campaign.owner)}
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <CalendarIcon className="h-4 w-4" />
                                                <span className="font-medium">Deadline</span>
                                            </div>
                                            <p className="text-sm">
                                                {formatDeadline(campaign.deadline)}
                                            </p>
                                            <p className="text-sm">
                                                {isExpired ? (
                                                    <span className="font-medium text-red-600">
                                                        Campaign Expired
                                                    </span>
                                                ) : (
                                                    <span className="font-medium text-green-600">
                                                        {timeLeft} remaining
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Finalize Campaign */}
                                    {isOwner && isExpired && !campaign.completed && (
                                        <>
                                            <Separator />
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle className="text-lg">
                                                        Finalize Campaign
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <Button
                                                        onClick={handleFinalize}
                                                        disabled={isFinalizing || !signer}
                                                        className="w-full"
                                                    >
                                                        {isFinalizing
                                                            ? "Finalizing..."
                                                            : "Finalize"}
                                                    </Button>
                                                </CardContent>
                                            </Card>
                                        </>
                                    )}

                                    {/* Claim Refund */}
                                    {campaign.completed &&
                                        !goalReached &&
                                        userContribution > 0n && (
                                            <>
                                                <Separator />
                                                <Card>
                                                    <CardHeader>
                                                        <CardTitle className="text-lg">
                                                            Claim Refund
                                                        </CardTitle>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <Button
                                                            onClick={handleClaimRefund}
                                                            disabled={isClaiming || !signer}
                                                            className="w-full"
                                                        >
                                                            {isClaiming
                                                                ? "Claiming..."
                                                                : "Claim Refund"}
                                                        </Button>
                                                    </CardContent>
                                                </Card>
                                            </>
                                        )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Contribution Sidebar */}
                        <div className="space-y-6">
                            {/* Token Balance */}
                            {tokenInfo && signerAddress && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Your Balance</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="text-center">
                                            <p className="font-bold text-2xl">
                                                {formatTokenAmount(
                                                    tokenInfo.userBalance,
                                                    tokenInfo.decimals
                                                )}
                                            </p>
                                            <p className="text-muted-foreground">
                                                {tokenInfo.symbol}
                                            </p>
                                        </div>
                                        <Button
                                            onClick={handleMintTokens}
                                            disabled={isMinting || !signer}
                                            variant="outline"
                                            className="w-full"
                                        >
                                            {isMinting ? "Minting..." : "Get Free Tokens (Faucet)"}
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Contribution Form */}
                            {!campaign.completed && !isExpired && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">
                                            Contribute to Campaign
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="amount">
                                                Amount ({tokenInfo?.symbol})
                                            </Label>
                                            <Input
                                                id="amount"
                                                type="number"
                                                placeholder="100"
                                                value={contributionAmount}
                                                onChange={(e) =>
                                                    setContributionAmount(e.target.value)
                                                }
                                                disabled={isContributing || isApproving || !signer}
                                                min="0.01"
                                                step="0.01"
                                            />
                                        </div>
                                        {isAllowanceSufficient ? (
                                            <Button
                                                onClick={handleContribute}
                                                disabled={
                                                    isContributing ||
                                                    isApproving ||
                                                    !signer ||
                                                    !contributionAmount
                                                }
                                                className="w-full"
                                            >
                                                {isContributing ? "Contributing..." : "Contribute"}
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={handleApprove}
                                                disabled={
                                                    isApproving ||
                                                    isContributing ||
                                                    !signer ||
                                                    !contributionAmount
                                                }
                                                className="w-full"
                                            >
                                                {isApproving ? "Approving..." : "Approve"}
                                            </Button>
                                        )}
                                        {!signer && (
                                            <p className="text-center text-muted-foreground text-sm">
                                                Connect your wallet to contribute
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* User's Contribution */}
                            {userContribution > 0n && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Your Contribution</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-center">
                                            <p className="font-bold text-xl">
                                                {formatTokenAmount(
                                                    [userContribution, 0n, 0n, 0n],
                                                    tokenInfo?.decimals as number
                                                )}
                                            </p>
                                            <p className="text-muted-foreground">
                                                {tokenInfo?.symbol}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
