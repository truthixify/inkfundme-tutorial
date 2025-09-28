""

import { formatDistanceToNowStrict } from "date-fns"
import { CalendarIcon, UsersIcon } from "lucide-react"
import { Link } from "react-router-dom"
import type { FixedSizeArray, FixedSizeBinary } from "polkadot-api"
import { formatAddress } from "../lib/utils"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button-extended"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Progress } from "./ui/progress"
import { Separator } from "./ui/separator"

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
}

interface CampaignCardProps {
    campaign: Campaign
    tokenInfo: TokenInfo | null
}

export function CampaignCard({ campaign, tokenInfo }: CampaignCardProps) {
    // Helper function to format token amount
    const formatTokenAmount = (amount: FixedSizeArray<4, bigint>, decimals = 18): string => {
        if (!amount) return "0"

        const value = amount[0] || 0n
        const divisor = 10n ** BigInt(decimals)
        const wholePart = value / divisor
        const fractionalPart = value % divisor

        if (fractionalPart === 0n) {
            return wholePart.toString()
        }

        const fractionalStr = fractionalPart.toString().padStart(decimals, "0")
        const trimmedFractional = fractionalStr.replace(/0+$/, "")

        return trimmedFractional ? `${wholePart}.${trimmedFractional}` : wholePart.toString()
    }

    // Calculate progress percentage
    const calculateProgress = (
        raised: FixedSizeArray<4, bigint>,
        goal: FixedSizeArray<4, bigint>
    ): number => {
        const raisedValue = raised[0] || 0n
        const goalValue = goal[0] || 1n

        if (goalValue === 0n) return 0

        const percentage = (Number(raisedValue) / Number(goalValue)) * 100
        return Math.min(percentage, 100)
    }

    const progress = calculateProgress(campaign.raised, campaign.goal)
    const deadlineDate = new Date(Number(campaign.deadline) * 1000)
    const isExpired = deadlineDate.getTime() < Date.now()
    const goalReached = progress >= 100
    const timeLeft = !isExpired
        ? formatDistanceToNowStrict(deadlineDate, { addSuffix: false })
        : null

    return (
        <Card
            key={campaign.id}
            className="w-full min-w-[300px] max-w-md transition-shadow hover:shadow-lg"
        >
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                        <CardTitle className="text-lg">{campaign.title}</CardTitle>
                        <p className="text-muted-foreground text-sm">
                            {campaign.description.length > 100
                                ? `${campaign.description.slice(0, 100)}...`
                                : campaign.description}
                        </p>
                    </div>
                    <div className="ml-3">
                        {campaign.completed ? (
                            goalReached ? (
                                <Badge variant="default">Success</Badge>
                            ) : (
                                <Badge variant="destructive">Failed</Badge>
                            )
                        ) : isExpired ? (
                            <Badge variant="secondary">Expired</Badge>
                        ) : (
                            <Badge variant="outline">Active</Badge>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-muted-foreground text-sm">
                        <span>
                            {formatTokenAmount(campaign.raised, tokenInfo?.decimals)}{" "}
                            {tokenInfo?.symbol}
                        </span>
                        <span>
                            Goal: {formatTokenAmount(campaign.goal, tokenInfo?.decimals)}{" "}
                            {tokenInfo?.symbol}
                        </span>
                    </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                            <UsersIcon className="h-3 w-3" />
                            <span>Creator</span>
                        </div>
                        <p className="font-mono text-xs">{formatAddress(campaign.owner)}</p>
                    </div>
                    <div>
                        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                            <CalendarIcon className="h-3 w-3" />
                            <span>Deadline</span>
                        </div>
                        <p className="text-xs">
                            {isExpired ? (
                                <span className="text-red-600">Expired</span>
                            ) : (
                                <span className="text-green-600">{timeLeft} left</span>
                            )}
                        </p>
                    </div>
                </div>

                <Link to={`/campaign/${campaign.id}`}>
                    <Button className="w-full">View Details</Button>
                </Link>
            </CardContent>
        </Card>
    )
}
