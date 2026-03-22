import { useEffect, useState } from 'react'
import { TopBar } from '@/components/TopBar'
import { SessionModal } from '@/components/SessionModal'
import { SettingsModal } from '@/components/SettingsModal'
import { ChatPane } from '@/components/ChatPane'
import { ArtifactViewer } from '@/components/ArtifactViewer'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { LoginPage } from '@/components/LoginPage'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/lib/api'
import { Loader2 } from 'lucide-react'

function App() {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const setUser = useAuthStore((s) => s.setUser)
  const setIsLoading = useAuthStore((s) => s.setIsLoading)

  const [authError, setAuthError] = useState<string | null>(null)

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  // Verify session cookie by calling /api/auth/me
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setAuthError(null)

    authApi
      .me()
      .then((userData) => {
        if (!cancelled) {
          setUser(userData)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setUser(null)
          setIsLoading(false)
          if (err instanceof Error && err.message.includes('Session expired')) {
            setAuthError('Your session has expired. Please sign in again.')
          }
        }
      })

    return () => { cancelled = true }
  }, [setUser, setIsLoading])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage error={authError} />
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Left: Artifact Viewer */}
        <ResizablePanel defaultSize="65%" minSize="30%">
          <div className="flex h-full flex-col overflow-hidden">
            <ArtifactViewer />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        {/* Right: Chat Pane */}
        <ResizablePanel defaultSize="35%" minSize="30%" maxSize="50%">
          <ChatPane />
        </ResizablePanel>
      </ResizablePanelGroup>
      <SessionModal />
      <SettingsModal />
    </div>
  )
}

export default App
