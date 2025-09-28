import { Suspense } from "react"
import { Toaster } from "./components/ui/sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import { WalletProviders } from "./components/wallet-provider"
import { Outlet } from "react-router-dom"
import { LoadingScreen } from "./components/ui/loading"

function App() {
    return (
        <>
            <Toaster position="top-center" closeButton />
            <TooltipProvider>
                <WalletProviders>
                    <Suspense fallback={<LoadingScreen />}>
                        <Outlet />
                    </Suspense>
                </WalletProviders>
            </TooltipProvider>
        </>
    )
}

export default App
