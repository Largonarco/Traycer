import { useState } from 'react'
import { Settings, Github, LogOut, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuthStore } from '@/stores/authStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import { useGitHubStatus, useSessions } from '@/hooks/useQueries'

export function TopBar() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setSessionModalOpen = useUIStore((s) => s.setSessionModalOpen)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const { data: sessions } = useSessions()
  const { data: githubStatus } = useGitHubStatus()

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [avatarPopoverOpen, setAvatarPopoverOpen] = useState(false)

  const activeSession = sessions?.find((s) => s.id === activeSessionId)

  const handleSignOut = () => {
    setAvatarPopoverOpen(false)
    logout()
    useSessionStore.getState().reset()
    useMessageStore.getState().clear()
  }

  const handleSettingsClick = () => {
    setAvatarPopoverOpen(false)
    setSettingsOpen(true)
  }

  return (
    <header className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
      {/* Left: Brand + Session breadcrumb */}
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="text-xs font-bold tracking-wider text-muted-foreground">Traycer</span>
        {activeSession && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <Button
              variant="link"
              size="sm"
              onClick={() => setSessionModalOpen(true)}
              className="h-auto truncate p-0 text-xs font-medium text-foreground/90 no-underline transition-colors hover:text-foreground hover:no-underline"
            >
              {activeSession.github_repo ?? activeSession.name}
            </Button>
          </>
        )}
        {!activeSession && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <Button
              variant="link"
              size="sm"
              onClick={() => setSessionModalOpen(true)}
              className="h-auto p-0 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground hover:no-underline"
            >
              Select session…
            </Button>
          </>
        )}
      </div>

      {/* Right: Status + Avatar with popover */}
      <div className="flex items-center gap-1.5">
        {githubStatus?.connected && (
          <Badge variant="outline" className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-400">
            <Github className="h-2.5 w-2.5" />
            Connected
          </Badge>
        )}
        {githubStatus && !githubStatus.connected && (
          <a href="/auth/github">
            <Badge variant="outline" className="h-5 cursor-pointer gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-400 hover:bg-amber-500/20">
              <Github className="h-2.5 w-2.5" />
              Connect
            </Badge>
          </a>
        )}

        {user && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />

            <Popover open={avatarPopoverOpen} onOpenChange={setAvatarPopoverOpen}>
              <PopoverTrigger
                render={
                  <button className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                }
              >
                {user.github_avatar_url ? (
                  <img
                    src={user.github_avatar_url}
                    alt={user.display_name}
                    className="h-5 w-5 rounded-full ring-1 ring-border transition-opacity hover:opacity-80"
                  />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground transition-opacity hover:opacity-80">
                    {user.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </PopoverTrigger>
              <PopoverContent className="p-1 gap-y-0.5 max-w-40">
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium truncate">{user.display_name}</p>
                  {user.email && (
                    <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                  )}
                </div>

                <Separator />

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs font-normal"
                  onClick={handleSettingsClick}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs font-normal text-destructive hover:text-destructive"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </header>
  )
}
