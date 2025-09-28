""

import { createReviveSdk, type ReviveSdkTypedApi } from "@polkadot-api/sdk-ink"
import { useChainId, useTypedApi } from "@reactive-dot/react"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useSignerAndAddress } from "../hooks/use-signer-and-address"
import { inkFundMe } from "../lib/contracts"
import { Button } from "./ui/button-extended"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { INK_FUND_ME_ADDRESS } from "../lib/constants"
import type { FixedSizeArray } from "polkadot-api"

interface CreateCampaignFormProps {
    onCampaignCreated?: () => void
    tokenInfo?: {
        name: string
        symbol: string
        decimals: number
        totalSupply: FixedSizeArray<4, bigint>
    } | null
}

export function CreateCampaignForm({ onCampaignCreated, tokenInfo }: CreateCampaignFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        goal: "",
        deadline: "",
    })

    const api = useTypedApi()
    const chain = useChainId()
    const { signer, signerAddress } = useSignerAndAddress()

    const handleInputChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
    }

    const handleCreateCampaign = useCallback(async () => {
        if (!api || !chain || !signer || !signerAddress) {
            toast.error("Please connect your wallet first")
            return
        }

        if (!formData.title || !formData.description || !formData.goal || !formData.deadline) {
            toast.error("Please fill in all fields")
            return
        }

        setIsLoading(true)

        try {
            const sdk = createReviveSdk(api as ReviveSdkTypedApi, inkFundMe.contract)

            if (!INK_FUND_ME_ADDRESS) {
                toast.error("Contract not deployed on this chain")
                return
            }
            const contract = sdk.getContract(INK_FUND_ME_ADDRESS)

            // Map account if not mapped
            const isMapped = await sdk.addressIsMapped(signerAddress)
            if (!isMapped) {
                toast.error("Account not mapped. Please map your account first.")
                return
            }

            // Convert goal to U256 format (assuming 18 decimals)
            const goalAmount = Number.parseFloat(formData.goal)
            const goalU256: [bigint, bigint, bigint, bigint] = [
                BigInt(Math.floor(goalAmount)),
                0n,
                0n,
                0n,
            ]

            // Convert deadline to timestamp
            const deadlineTimestamp = BigInt(
                Math.floor(new Date(formData.deadline).getTime() / 1000)
            )

            const tx = contract
                .send("create_campaign", {
                    origin: signerAddress,
                    data: {
                        title: formData.title,
                        description: formData.description,
                        goal: goalU256,
                        deadline: deadlineTimestamp,
                    },
                })
                .signAndSubmit(signer)
                .then((tx) => {
                    if (!tx.ok)
                        throw new Error("Failed to create campaign", { cause: tx.dispatchError })

                    // Reset form
                    setFormData({
                        title: "",
                        description: "",
                        goal: "",
                        deadline: "",
                    })

                    // Notify parent component
                    onCampaignCreated?.()

                    return tx
                })

            toast.promise(tx, {
                loading: "Creating campaign...",
                success: "Campaign created successfully!",
                error: (error) => {
                    if (
                        error.message.includes("User denied transaction") ||
                        error.message.includes("rejected") ||
                        error.message.includes("Cancelled")
                    ) {
                        return "Transaction canceled by user"
                    }
                    return "Failed to create campaign"
                },
            })

            await tx
        } catch (error: any) {
            console.error("Error creating campaign:", error)
        } finally {
            setIsLoading(false)
        }
    }, [api, chain, signer, signerAddress, formData, onCampaignCreated])

    // Get minimum date (today)
    const today = new Date().toISOString().split("T")[0]

    return (
        <div className="space-y-6">
            {/* Campaign Creation Form */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="title">Campaign Title</Label>
                    <Input
                        id="title"
                        placeholder="Enter your campaign title"
                        value={formData.title}
                        onChange={(e) => handleInputChange("title", e.target.value)}
                        disabled={isLoading}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        placeholder="Describe your campaign and why people should support it"
                        value={formData.description}
                        onChange={(e: any) => handleInputChange("description", e.target.value)}
                        disabled={isLoading}
                        rows={4}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="goal">
                            Funding Goal {tokenInfo && `(${tokenInfo.symbol})`}
                        </Label>
                        <Input
                            id="goal"
                            type="number"
                            placeholder="1000"
                            value={formData.goal}
                            onChange={(e) => handleInputChange("goal", e.target.value)}
                            disabled={isLoading}
                            min="1"
                            step="0.01"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="deadline">Campaign Deadline</Label>
                        <Input
                            id="deadline"
                            type="date"
                            value={formData.deadline}
                            onChange={(e) => handleInputChange("deadline", e.target.value)}
                            disabled={isLoading}
                            min={today}
                        />
                    </div>
                </div>

                <Button
                    onClick={handleCreateCampaign}
                    disabled={isLoading || !signer}
                    className="w-full"
                >
                    {isLoading ? "Creating Campaign..." : "Create Campaign"}
                </Button>

                {!signer && (
                    <div className="rounded-lg border bg-muted/50 p-4 text-center">
                        <p className="text-muted-foreground text-sm">
                            Please connect your wallet to create a campaign
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
