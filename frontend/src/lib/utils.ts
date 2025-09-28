import { type ClassValue, clsx } from "clsx"
import type { FixedSizeBinary } from "polkadot-api"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// Helper function to format address
export const formatAddress = (address: FixedSizeBinary<20>): string => {
    try {
        const hex = address.asHex()
        return `${hex.slice(0, 6)}...${hex.slice(-4)}`
    } catch (error) {
        return "0x000000...0000"
    }
}
