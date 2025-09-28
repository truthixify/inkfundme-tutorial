import { Loader2 } from "lucide-react"

export function LoadingScreen() {
    return (
        <div className="flex flex-col gap-8 h-screen w-full items-center justify-center absolute top-0 left-0 bg-background">
            <Loader2 className="animate-spin" />
            <p className="text-lg font-medium">Loading...</p>
        </div>
    )
}
