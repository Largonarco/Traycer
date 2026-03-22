import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Plus, ArrowLeft, Github, Lock, Loader2, ChevronsUpDown, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'
import { useSessions, useCreateSession, useDeleteSession, useGitHubStatus, useGitHubRepos } from '@/hooks/useQueries'
import { useMessageStore } from '@/stores/messageStore'
import type { Session, GitHubRepo } from '@/lib/api'

type ModalView = 'list' | 'create'

export function SessionModal() {
  const sessionModalOpen = useUIStore((s) => s.sessionModalOpen)
  const setSessionModalOpen = useUIStore((s) => s.setSessionModalOpen)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId)

  const { data: sessions, isLoading: sessionsLoading } = useSessions()
  const { data: githubStatus } = useGitHubStatus()
  const { data: repos, refetch: fetchRepos, isFetching: reposFetching } = useGitHubRepos()
  const createSession = useCreateSession()
  const deleteSession = useDeleteSession()

  const [view, setView] = useState<ModalView>('list')
  const [sessionName, setSessionName] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [repoPickerOpen, setRepoPickerOpen] = useState(false)
  const [nameError, setNameError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)

  // When modal opens, reset to list view
  useEffect(() => {
    if (sessionModalOpen) {
      setView('list')
      setSessionName('')
      setSelectedRepo(null)
      setRepoPickerOpen(false)
      setNameError('')
      setDeletingId(null)
      setSessionToDelete(null)
    }
  }, [sessionModalOpen])

  // Fetch repos when switching to create view and GitHub is connected
  useEffect(() => {
    if (view === 'create' && githubStatus?.connected) {
      fetchRepos()
    }
  }, [view, githubStatus?.connected, fetchRepos])

  const handleSelectSession = (session: Session) => {
    setActiveSessionId(session.id)
    setSessionModalOpen(false)
  }

  const handleDeleteSession = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation() // Prevent selecting the session
    setSessionToDelete(session)
  }

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return
    const session = sessionToDelete
    setSessionToDelete(null)
    setDeletingId(session.id)
    try {
      await deleteSession.mutateAsync(session.id)
      // If the deleted session was the active one, reset state
      if (activeSessionId === session.id) {
        setActiveSessionId(null)
        useMessageStore.getState().clear()
      }
    } catch (err) {
      console.error('[SessionModal] Failed to delete session:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreateSession = async () => {
    const trimmed = sessionName.trim()
    if (!trimmed) {
      setNameError('Session name is required')
      return
    }
    setNameError('')

    try {
      const newSession = await createSession.mutateAsync({
        name: trimmed,
        github_repo: selectedRepo,
      })
      setActiveSessionId(newSession.id)
      setSessionModalOpen(false)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  const formatDate = (timestamp: number) => {
    const diff = Date.now() - timestamp
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'Yesterday'
    return `${days}d ago`
  }

  // Cannot dismiss without an active session
  const canDismiss = !!activeSessionId

  return (
    <>
    <Dialog
      open={sessionModalOpen}
      onOpenChange={(open) => {
        if (!open && !canDismiss) return // Prevent closing without session
        setSessionModalOpen(open)
      }}
    >
      <DialogContent
        className="sm:max-w-[460px] max-h-[85vh] flex flex-col overflow-hidden"
        showCloseButton={canDismiss}
      >
        {view === 'list' ? (
          <>
            <DialogHeader>
              <DialogTitle>Sessions</DialogTitle>
            </DialogHeader>

            {/* New Session Button */}
            <Button
              variant="outline"
              onClick={() => setView('create')}
              className="w-full justify-start gap-2 border-dashed hover:border-primary/50"
            >
              <Plus className="h-4 w-4" />
              New Session
            </Button>

            <Separator className="my-1" />

            {/* Session List */}
            <ScrollArea className="max-h-80 overflow-y-scroll no-scrollbar">
              <div className="space-y-1.5">
                {sessionsLoading && (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading sessions...
                  </div>
                )}
                {!sessionsLoading && (!sessions || sessions.length === 0) && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No sessions yet. Create one to get started.
                  </div>
                )}
                {sessions?.map((session) => (
                  <div
                    key={session.id}
                    className="flex h-auto w-full items-center rounded-lg border border-border bg-background p-3 text-left hover:bg-muted hover:text-foreground cursor-pointer dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                    onClick={() => handleSelectSession(session)}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium truncate block">{session.name}</span>
                      <span className="text-xs text-muted-foreground truncate block">
                        {session.github_repo ? session.github_repo : 'No repository'}
                        {' · '}
                        {formatDate(session.last_active_at)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteSession(e, session)}
                      disabled={deletingId === session.id}
                      title="Delete session"
                    >
                      {deletingId === session.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setView('list')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>New Session</DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
              {/* Session Name */}
              <div className="space-y-2">
                <Label htmlFor="session-name">Session Name</Label>
                <Input
                  id="session-name"
                  placeholder="e.g. Auth System Redesign"
                  value={sessionName}
                  onChange={(e) => {
                    setSessionName(e.target.value)
                    if (nameError) setNameError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSession()
                  }}
                />
                {nameError && (
                  <p className="text-xs text-destructive">{nameError}</p>
                )}
              </div>

              {/* GitHub Repository */}
              <div className="space-y-2">
                <Label>GitHub Repository</Label>
                {!githubStatus?.connected ? (
                  <a href="/auth/github" className="block">
                    <Button variant="outline" className="w-full gap-2" type="button">
                      <Github className="h-4 w-4" />
                      Connect GitHub
                    </Button>
                  </a>
                ) : (
                  <Popover open={repoPickerOpen} onOpenChange={setRepoPickerOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          className="w-full justify-between font-normal"
                        />
                      }
                    >
                      <span className="flex items-center gap-2 truncate">
                        {selectedRepo ? (
                          <>
                            {repos?.find((r: GitHubRepo) => r.full_name === selectedRepo)?.private && (
                              <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">{selectedRepo}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Select repository…</span>
                        )}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[--anchor-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search repositories..." />
                        <CommandList>
                          {reposFetching ? (
                            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Loading repositories...
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>No repositories found.</CommandEmpty>
                              <CommandGroup>
                                {(repos ?? []).map((repo: GitHubRepo) => (
                                  <CommandItem
                                    key={repo.id}
                                    value={repo.full_name}
                                    onSelect={(value) => {
                                      setSelectedRepo(value === selectedRepo ? null : value)
                                      setRepoPickerOpen(false)
                                    }}
                                  >
                                    {repo.private && (
                                      <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="truncate">{repo.full_name}</span>
                                    <Check
                                      className={cn(
                                        'ml-auto h-3.5 w-3.5 shrink-0',
                                        selectedRepo === repo.full_name ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setView('list')}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateSession}
                  disabled={createSession.isPending}
                >
                  {createSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Session
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => { if (!open) setSessionToDelete(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete session</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{sessionToDelete?.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className='p-2'>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDeleteSession}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
