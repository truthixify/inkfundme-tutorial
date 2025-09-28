import { Loader2 } from "lucide-react"

export function LoadingScreen() {
    return (
        <div className="flex flex-col gap-8 h-screen w-full items-center justify-center absolute top-0 left-0 bg-black/20 backdrop-blur-md">
            <Loader2 className="animate-spin text-white" />
            <p className="text-lg font-medium text-white">Loading...</p>
        </div>
    )
}