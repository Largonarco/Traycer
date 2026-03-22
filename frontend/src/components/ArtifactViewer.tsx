import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  tablePlugin,
  linkPlugin,
  linkDialogPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertTable,
  UndoRedo,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import {
  Pencil, Save, Check, History, X, RotateCcw, ArrowLeft,
  FileText, Ticket, Plus, ChevronDown, Layers,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'

import { useSessionStore } from '@/stores/sessionStore'
import { useStreamingStore } from '@/stores/streamingStore'
import { useUIStore } from '@/stores/uiStore'
import { useArtifactContent, useArtifactVersions, useArtifacts } from '@/hooks/useQueries'
import { artifactsApi } from '@/lib/api'
import type { Artifact, ArtifactVersion } from '@/lib/api'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
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

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewerMode = 'read' | 'edit' | 'streaming' | 'preview'

// ─── Artifact Dropdown (for toolbar) ────────────────────────────────────────

function ArtifactDropdown({
  label,
  icon: Icon,
  items,
  activeArtifactId,
  onSelect,
  onAdd,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  items: Artifact[]
  activeArtifactId: string | null
  onSelect: (artifact: Artifact) => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="xs" className="gap-1 text-[11px] text-muted-foreground" />
        }
      >
        <Icon className="size-2.5" />
        <span>{label}</span>
        <span className="text-[10px] text-muted-foreground/60">{items.length}</span>
        <ChevronDown className="size-2" />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-56 p-0 gap-y-0.5">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No {label.toLowerCase()} yet
          </div>
        ) : (
          <ScrollArea className="max-h-60">
            <div className="flex flex-col py-1">
              {items.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  size="xs"
                  className={cn(
                    'w-full justify-start gap-2 rounded-none font-normal',
                    item.id === activeArtifactId && 'bg-accent font-medium'
                  )}
                  onClick={() => {
                    onSelect(item)
                    setOpen(false)
                  }}
                >
                  <Icon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.name}</span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        )}

        <Separator/>

        <div className="p-1">
          <Button
            variant="outline"
            size="xs"
            className="w-full gap-2 font-normal text-muted-foreground justify-center"
            onClick={() => {
              onAdd()
              setOpen(false)
            }}
          >
            <Plus className="size-3 shrink-0" />
            <span>Add {label === 'SPECS' ? 'Spec' : 'Ticket'}</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Version History Popover ────────────────────────────────────────────────

function VersionHistoryPopover({
  artifactId,
  onSelectVersion,
}: {
  artifactId: string
  onSelectVersion: (version: ArtifactVersion) => void
}) {
  const { data: versions, isLoading } = useArtifactVersions(artifactId)
  const [open, setOpen] = useState(false)

  const sortedVersions = useMemo(
    () => (versions ? [...versions].sort((a, b) => b.version_number - a.version_number) : []),
    [versions]
  )

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" title="Version history" />}
      >
        <History className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-48 p-0">
        <div className="border-b border-border px-2.5 py-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Version History
          </span>
        </div>
        {isLoading ? (
          <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">Loading…</div>
        ) : sortedVersions.length === 0 ? (
          <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">No versions yet</div>
        ) : (
          <ScrollArea className="max-h-52">
            <div className="flex flex-col py-0.5">
              {sortedVersions.map((v) => (
                <Button
                  key={v.id}
                  variant="ghost"
                  size="xs"
                  className="flex h-auto w-full flex-col items-start gap-0.5 rounded-none px-2.5 py-1.5 text-left"
                  onClick={() => { onSelectVersion(v); setOpen(false) }}
                >
                  <span className="text-xs font-medium">v{v.version_number}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {formatTimestamp(v.created_at)}{v.label ? ` · ${v.label}` : ''}
                  </span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ─── Main ArtifactViewer Component ──────────────────────────────────────────

export function ArtifactViewer() {
  const queryClient = useQueryClient()

  // Stores
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const activeArtifactId = useSessionStore((s) => s.activeArtifactId)
  const activeArtifactType = useSessionStore((s) => s.activeArtifactType)
  const setActiveArtifactId = useSessionStore((s) => s.setActiveArtifactId)
  const setActiveArtifactType = useSessionStore((s) => s.setActiveArtifactType)

  const isStreaming = useStreamingStore((s) => s.isStreaming)
  const streamingArtifactId = useStreamingStore((s) => s.streamingArtifactId)
  const streamBuffer = useStreamingStore((s) => s.streamBuffer)

  const newArtifactId = useUIStore((s) => s.newArtifactId)
  const setNewArtifactId = useUIStore((s) => s.setNewArtifactId)

  // Queries
  const { data: artifacts } = useArtifacts(activeSessionId)
  const { data: currentVersion, isLoading } = useArtifactContent(activeArtifactId)

  // State
  const [mode, setMode] = useState<ViewerMode>('read')
  const [previewVersion, setPreviewVersion] = useState<ArtifactVersion | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newerVersionAvailable, setNewerVersionAvailable] = useState(false)

  // Unsaved-changes confirmation state
  const [pendingAction, setPendingAction] = useState<{ message: string; onConfirm: () => void } | null>(null)

  // Create artifact modal
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createModalType, setCreateModalType] = useState<'spec' | 'ticket'>('spec')
  const [createArtifactName, setCreateArtifactName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const loadedContentRef = useRef<string>('')
  const editorRef = useRef<MDXEditorMethods>(null)
  const prevArtifactIdRef = useRef<string | null>(null)
  const prevVersionNumberRef = useRef<number | undefined>(undefined)
  const suppressAutoSwitchRef = useRef<string | null>(null)

  // Derived
  const activeArtifact = useMemo(
    () => artifacts?.find((a) => a.id === activeArtifactId) ?? null,
    [artifacts, activeArtifactId]
  )
  const specs = useMemo(() => artifacts?.filter((a) => a.type === 'spec') ?? [], [artifacts])
  const tickets = useMemo(() => artifacts?.filter((a) => a.type === 'ticket') ?? [], [artifacts])

  const isCurrentArtifactStreaming = isStreaming && streamingArtifactId === activeArtifactId

  // Artifact selection — dirty check before switching
  const handleSelectArtifact = useCallback((artifact: Artifact) => {
    const doSwitch = () => {
      setActiveArtifactId(artifact.id)
      setActiveArtifactType(artifact.type)
    }
    if (isDirty) {
      setPendingAction({ message: 'You have unsaved changes. Discard and switch artifacts?', onConfirm: doSwitch })
      return
    }
    doSwitch()
  }, [isDirty, setActiveArtifactId, setActiveArtifactType])

  const handleOpenCreateModal = useCallback((type: 'spec' | 'ticket') => {
    setCreateModalType(type)
    setCreateArtifactName('')
    setCreateModalOpen(true)
  }, [])

  const handleCreateArtifact = useCallback(async () => {
    if (!activeSessionId || !createArtifactName.trim()) return
    setIsCreating(true)
    try {
      const newArtifact = await artifactsApi.create(activeSessionId, createArtifactName.trim(), createModalType)
      await queryClient.invalidateQueries({ queryKey: ['artifacts', activeSessionId] })
      setActiveArtifactId(newArtifact.id)
      setActiveArtifactType(newArtifact.type)
      setNewArtifactId(newArtifact.id)
      setCreateModalOpen(false)
    } catch (error) {
      console.error('Failed to create artifact:', error)
    } finally {
      setIsCreating(false)
    }
  }, [activeSessionId, createArtifactName, createModalType, queryClient, setActiveArtifactId, setActiveArtifactType, setNewArtifactId])

  // Auto-enter edit mode for newly created artifacts
  useEffect(() => {
    if (newArtifactId && newArtifactId === activeArtifactId) {
      setMode('edit')
      setIsDirty(false)
      setPreviewVersion(null)
      setNewerVersionAvailable(false)
      loadedContentRef.current = ''
      setTimeout(() => { editorRef.current?.setMarkdown('') }, 0)
      setNewArtifactId(null)
    }
  }, [newArtifactId, activeArtifactId, setNewArtifactId])

  // Auto-select streaming artifact.
  // Uses a suppressAutoSwitch ref so that if the user declines the dirty-check
  // prompt, we don't re-prompt on every render. The suppression is keyed to
  // a specific streamingArtifactId so a *new* streaming artifact can still prompt.
  useEffect(() => {
    if (isStreaming && streamingArtifactId && streamingArtifactId !== activeArtifactId) {
      // If user already declined for this specific streaming artifact, don't re-prompt
      if (suppressAutoSwitchRef.current === streamingArtifactId) return

      if (isDirty) {
        const capturedId = streamingArtifactId
        setPendingAction({
          message: 'You have unsaved changes. Discard and switch to the streaming artifact?',
          onConfirm: () => setActiveArtifactId(capturedId),
        })
        // Suppress further prompts for this specific streaming artifact until resolved
        suppressAutoSwitchRef.current = streamingArtifactId
        return
      }
      setActiveArtifactId(streamingArtifactId)
    }

    // Reset suppression when streaming ends or the streaming artifact changes
    if (!isStreaming || !streamingArtifactId) {
      suppressAutoSwitchRef.current = null
    }
  }, [isStreaming, streamingArtifactId, activeArtifactId, isDirty, setActiveArtifactId])

  // Mode transitions based on streaming
  useEffect(() => {
    if (isCurrentArtifactStreaming) {
      setMode('streaming')
      setIsDirty(false)
      setPreviewVersion(null)
    } else if (mode === 'streaming') {
      setMode('read')
    }
  }, [isCurrentArtifactStreaming]) // eslint-disable-line

  // Update editor when current version changes
  useEffect(() => {
    if (!currentVersion) return
    if (mode === 'edit' && isDirty) {
      if (prevVersionNumberRef.current !== undefined && currentVersion.version_number > prevVersionNumberRef.current) {
        setNewerVersionAvailable(true)
      }
      return
    }
    loadedContentRef.current = currentVersion.content
    prevVersionNumberRef.current = currentVersion.version_number
    editorRef.current?.setMarkdown(currentVersion.content)
    setIsDirty(false)
    setNewerVersionAvailable(false)
  }, [currentVersion]) // eslint-disable-line

  // Reset viewer state on artifact change.
  // The dirty-check prompt is handled imperatively by handleSelectArtifact
  // (and the streaming auto-switch effect) BEFORE setActiveArtifactId is called,
  // so by the time this effect fires, the switch has already been confirmed.
  useEffect(() => {
    if (prevArtifactIdRef.current !== activeArtifactId) {
      setMode('read')
      setIsDirty(false)
      setPreviewVersion(null)
      setNewerVersionAvailable(false)
    }
    prevArtifactIdRef.current = activeArtifactId
  }, [activeArtifactId]) // eslint-disable-line

  // Handlers
  const handleEdit = useCallback(() => {
    if (mode === 'preview') setPreviewVersion(null)
    setMode('edit')
    setNewerVersionAvailable(false)
    if (currentVersion) {
      loadedContentRef.current = currentVersion.content
      prevVersionNumberRef.current = currentVersion.version_number
      setTimeout(() => { editorRef.current?.setMarkdown(currentVersion.content) }, 0)
    }
    setIsDirty(false)
  }, [mode, currentVersion])

  const handleDone = useCallback(() => {
    const doLeave = () => {
      setMode('read')
      setIsDirty(false)
      setNewerVersionAvailable(false)
      if (currentVersion) {
        editorRef.current?.setMarkdown(currentVersion.content)
        loadedContentRef.current = currentVersion.content
      }
    }
    if (isDirty) {
      setPendingAction({ message: 'You have unsaved changes. Are you sure you want to leave edit mode?', onConfirm: doLeave })
      return
    }
    doLeave()
  }, [isDirty, currentVersion])

  const handleSave = useCallback(async () => {
    if (!activeArtifactId) return
    const content = editorRef.current?.getMarkdown() ?? ''
    const baseVersion = currentVersion?.version_number ?? 0
    setIsSaving(true)
    try {
      const newVersion = await artifactsApi.saveVersion(activeArtifactId, content, baseVersion)
      toast.success(`Saved — version ${newVersion.version_number} created`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['artifact-versions', activeArtifactId] }),
        queryClient.invalidateQueries({ queryKey: ['artifact-content', activeArtifactId] }),
      ])
      loadedContentRef.current = content
      prevVersionNumberRef.current = newVersion.version_number
      setIsDirty(false)
      setNewerVersionAvailable(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('409') || message.toLowerCase().includes('version conflict')) {
        toast.error('Version conflict — someone else saved a newer version. Please reload.')
      } else {
        toast.error(`Failed to save: ${message}`)
      }
    } finally {
      setIsSaving(false)
    }
  }, [activeArtifactId, currentVersion, queryClient])

  const handleSelectVersion = useCallback((version: ArtifactVersion) => {
    const doPreview = () => {
      setPreviewVersion(version)
      setMode('preview')
      setIsDirty(false)
      setNewerVersionAvailable(false)
      setTimeout(() => { editorRef.current?.setMarkdown(version.content) }, 0)
    }
    if (isDirty) {
      setPendingAction({ message: 'You have unsaved changes. Preview a different version?', onConfirm: doPreview })
      return
    }
    doPreview()
  }, [isDirty])

  const handleBackToCurrent = useCallback(() => {
    setPreviewVersion(null)
    setMode('read')
    if (currentVersion) {
      loadedContentRef.current = currentVersion.content
      setTimeout(() => { editorRef.current?.setMarkdown(currentVersion.content) }, 0)
    }
  }, [currentVersion])

  const handleRestore = useCallback(async () => {
    if (!activeArtifactId || !previewVersion || !currentVersion) return
    setIsSaving(true)
    try {
      const restoreLabel = `Restored from v${previewVersion.version_number}`
      const newVersion = await artifactsApi.saveVersion(activeArtifactId, previewVersion.content, currentVersion.version_number, restoreLabel)
      toast.success(`Restored from v${previewVersion.version_number} — version ${newVersion.version_number} created`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['artifact-versions', activeArtifactId] }),
        queryClient.invalidateQueries({ queryKey: ['artifact-content', activeArtifactId] }),
      ])
      setPreviewVersion(null)
      setMode('read')
      setIsDirty(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message.includes('409') ? 'Version conflict — could not restore.' : `Failed to restore: ${message}`)
    } finally {
      setIsSaving(false)
    }
  }, [activeArtifactId, previewVersion, currentVersion, queryClient])

  const handleEditorChange = useCallback(() => {
    if (mode !== 'edit') return
    const current = editorRef.current?.getMarkdown() ?? ''
    setIsDirty(current !== loadedContentRef.current)
  }, [mode])

  // Content
  const isReadOnly = mode === 'read' || mode === 'streaming' || mode === 'preview'

  const displayContent = useMemo(() => {
    if (mode === 'streaming') return streamBuffer
    if (mode === 'preview' && previewVersion) return previewVersion.content
    return currentVersion?.content ?? ''
  }, [mode, streamBuffer, previewVersion, currentVersion])

  useEffect(() => {
    if (mode === 'streaming') editorRef.current?.setMarkdown(streamBuffer)
  }, [mode, streamBuffer])

  // Plugins
  const readOnlyPlugins = useMemo(
    () => [headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(), tablePlugin(), linkPlugin(), markdownShortcutPlugin()],
    []
  )
  const editPlugins = useMemo(
    () => [
      headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(), tablePlugin(), linkPlugin(), linkDialogPlugin(), markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <BoldItalicUnderlineToggles />
            <BlockTypeSelect />
            <ListsToggle />
            <CreateLink />
            <InsertTable />
          </>
        ),
      }),
    ],
    []
  )

  const editorKey = `${activeArtifactId ?? 'none'}-${mode}-${previewVersion?.id ?? 'current'}`

  const activeSpecId = activeArtifactType === 'spec' ? activeArtifactId : null
  const activeTicketId = activeArtifactType === 'ticket' ? activeArtifactId : null

  const formatUpdateTime = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleString(undefined, {
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // ── Render ──
  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* MDXEditor dark theme styles — uses oklch values from the design system */}
        <style>{`
          /* ── MDXEditor dark theme variables ── */
          .dark-theme,
          .dark-theme .mdxeditor,
          .dark-theme .mdxeditor-root-contenteditable,
          .dark-theme [role="textbox"] {
            --accentBase: oklch(0.224 0.005 286);
            --accentBgSubtle: oklch(0.224 0.005 286);
            --accentBg: oklch(0.224 0.005 286);
            --accentLine: oklch(1 0 0 / 10%);
            --accentBorder: oklch(1 0 0 / 10%);
            --accentBorderHover: oklch(0.696 0.17 162.48);
            --accentSolid: oklch(0.696 0.17 162.48);
            --accentSolidHover: oklch(0.696 0.17 162.48);
            --accentText: oklch(0.93 0 0);
            --accentTextContrast: oklch(0.145 0 0);
            --basePageBg: oklch(0.141 0.005 286);
            --baseBg: oklch(0.141 0.005 286);
            --baseBgSubtle: oklch(0.224 0.005 286);
            --baseBgHover: oklch(0.224 0.005 286);
            --baseLine: oklch(1 0 0 / 10%);
            --baseBorder: oklch(1 0 0 / 10%);
            --baseBorderHover: oklch(0.696 0.17 162.48);
            --baseText: oklch(0.93 0 0);
            --baseTextContrast: oklch(0.145 0 0);
            --baseTextHighContrast: oklch(0.93 0 0);
            color: oklch(0.93 0 0);
            background-color: transparent;
          }

          /* ── Toolbar ── */
          .dark-theme .mdxeditor-toolbar {
            background-color: oklch(0.178 0.005 286);
            border-color: oklch(1 0 0 / 10%);
            color: oklch(0.93 0 0);
          }
          .dark-theme [role="toolbar"] button {
            color: oklch(0.93 0 0) !important;
          }
          .dark-theme [role="toolbar"] button:hover {
            background-color: oklch(0.224 0.005 286) !important;
          }
          .dark-theme [role="toolbar"] button[data-state="on"] {
            background-color: oklch(0.224 0.005 286) !important;
            color: oklch(0.93 0 0) !important;
          }
          .dark-theme [role="toolbar"] svg {
            color: inherit !important;
          }

          /* ── Select / dropdown in toolbar ── */
          .dark-theme select,
          .dark-theme [role="toolbar"] select {
            background-color: oklch(0.178 0.005 286) !important;
            color: oklch(0.93 0 0) !important;
            border-color: oklch(1 0 0 / 10%) !important;
          }
          .dark-theme option {
            background-color: oklch(0.178 0.005 286);
            color: oklch(0.93 0 0);
          }

          /* ── Popups / dialogs inside MDXEditor ── */
          .dark-theme .mdxeditor-popup-container {
            background-color: oklch(0.178 0.005 286) !important;
            color: oklch(0.93 0 0) !important;
            border-color: oklch(1 0 0 / 10%) !important;
          }
          .dark-theme .mdxeditor-popup-container input {
            background-color: oklch(0.141 0.005 286) !important;
            color: oklch(0.93 0 0) !important;
            border-color: oklch(1 0 0 / 12%) !important;
          }
          .dark-theme .mdxeditor-popup-container button {
            color: oklch(0.93 0 0) !important;
          }

          /* ── Content area layout ── */
          .artifact-editor { flex: 1; overflow-y: auto; }
          .artifact-editor .mdxeditor-root-contenteditable { min-height: 100%; }
          .artifact-editor .mdxeditor-root-contenteditable > div { min-height: 100%; }

          /* ── Prose dark-mode overrides (supplement @tailwindcss/typography) ──
               The prose-invert class handles most color inversions, but we need
               explicit overrides for elements that use oklch theme colors or
               where MDXEditor's own styles interfere.                           */

          /* Headings — use high-contrast foreground */
          .dark-theme [role="textbox"] h1,
          .dark-theme [role="textbox"] h2,
          .dark-theme [role="textbox"] h3,
          .dark-theme [role="textbox"] h4,
          .dark-theme [role="textbox"] h5,
          .dark-theme [role="textbox"] h6 {
            color: oklch(0.93 0 0);
          }

          /* Links — use primary accent */
          .dark-theme [role="textbox"] a {
            color: oklch(0.696 0.17 162.48);
            text-decoration: underline;
            text-decoration-color: oklch(0.696 0.17 162.48 / 40%);
            text-underline-offset: 2px;
          }
          .dark-theme [role="textbox"] a:hover {
            text-decoration-color: oklch(0.696 0.17 162.48);
          }

          /* Inline code */
          .dark-theme [role="textbox"] :not(pre) > code {
            background-color: oklch(0.224 0.005 286);
            color: oklch(0.696 0.17 162.48);
            padding: 0.125rem 0.375rem;
            border-radius: 0.25rem;
            font-size: 0.85em;
          }
          .dark-theme [role="textbox"] :not(pre) > code::before,
          .dark-theme [role="textbox"] :not(pre) > code::after {
            content: none;
          }

          /* Fenced code blocks */
          .dark-theme [role="textbox"] pre {
            background-color: oklch(0.178 0.005 286);
            border: 1px solid oklch(1 0 0 / 8%);
            border-radius: 0.5rem;
            color: oklch(0.85 0 0);
          }
          .dark-theme [role="textbox"] pre code {
            background-color: transparent;
            color: inherit;
            padding: 0;
            border-radius: 0;
            font-size: 0.85em;
          }

          /* Blockquotes */
          .dark-theme [role="textbox"] blockquote {
            border-left-color: oklch(0.696 0.17 162.48 / 40%);
            color: oklch(0.7 0 0);
            font-style: italic;
          }

          /* Horizontal rules */
          .dark-theme [role="textbox"] hr {
            border-color: oklch(1 0 0 / 10%);
          }

          /* Tables */
          .dark-theme [role="textbox"] table {
            border-collapse: collapse;
            width: 100%;
          }
          .dark-theme [role="textbox"] thead {
            border-bottom: 2px solid oklch(1 0 0 / 15%);
          }
          .dark-theme [role="textbox"] thead th {
            color: oklch(0.93 0 0);
            font-weight: 600;
            padding: 0.5rem 0.75rem;
            text-align: left;
          }
          .dark-theme [role="textbox"] tbody td {
            padding: 0.5rem 0.75rem;
            border-bottom: 1px solid oklch(1 0 0 / 8%);
          }
          .dark-theme [role="textbox"] tbody tr:last-child td {
            border-bottom: none;
          }

          /* Strong / bold */
          .dark-theme [role="textbox"] strong {
            color: oklch(0.93 0 0);
            font-weight: 600;
          }

          /* List markers */
          .dark-theme [role="textbox"] ul > li::marker,
          .dark-theme [role="textbox"] ol > li::marker {
            color: oklch(0.556 0 0);
          }
        `}</style>

        {/* ── Toolbar Row 1: Artifact Selection ── */}
        <div className="flex h-8 items-center gap-1 border-b border-border bg-card/30 px-2">
          <ArtifactDropdown
            label="SPECS"
            icon={FileText}
            items={specs}
            activeArtifactId={activeSpecId}
            onSelect={handleSelectArtifact}
            onAdd={() => handleOpenCreateModal('spec')}
          />
          <Separator orientation="vertical" className="mx-0.5 h-3.5" />
          <ArtifactDropdown
            label="TICKETS"
            icon={Ticket}
            items={tickets}
            activeArtifactId={activeTicketId}
            onSelect={handleSelectArtifact}
            onAdd={() => handleOpenCreateModal('ticket')}
          />

          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center">
            {activeArtifactId && (
              <VersionHistoryPopover artifactId={activeArtifactId} onSelectVersion={handleSelectVersion} />
            )}

            {mode === 'read' && (
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" onClick={handleEdit} disabled={isCurrentArtifactStreaming || !activeArtifactId} title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}

            {mode === 'edit' && (
              <>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" onClick={handleSave} disabled={!isDirty || isSaving} title="Save">
                  <Save className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" onClick={handleDone} title="Done editing">
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            {mode === 'streaming' && (
              <>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground" disabled title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground" disabled title="Save"><Save className="h-3.5 w-3.5" /></Button>
              </>
            )}

            {mode === 'preview' && (
              <>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" onClick={handleRestore} disabled={isSaving} title="Restore this version">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" onClick={handleBackToCurrent} title="Back to current">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Toolbar Row 2: Artifact Title Bar ── */}
        {activeArtifact && (
          <div className="flex items-center gap-2 border-b border-border bg-card/20 px-4 py-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{activeArtifact.name}</span>
            {mode === 'edit' && isDirty && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">Unsaved</span>
            )}
            {mode === 'streaming' && (
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">Streaming…</span>
            )}
            {currentVersion && mode !== 'preview' && (
              <span className="text-[10px] text-muted-foreground">v{currentVersion.version_number}</span>
            )}
            <div className="flex-1" />
            {activeArtifact.updated_at && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Calendar className="h-2.5 w-2.5" />
                Updated: {formatUpdateTime(activeArtifact.updated_at)}
              </span>
            )}
          </div>
        )}

        {/* Preview banner */}
        {mode === 'preview' && previewVersion && (
          <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5">
            <span className="text-xs font-medium text-amber-400">
              Previewing version {previewVersion.version_number} — not the current version
            </span>
            <Button variant="ghost" size="icon-xs" onClick={handleBackToCurrent} title="Close preview">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Newer version notice */}
        {newerVersionAvailable && mode === 'edit' && (
          <div className="flex items-center justify-between border-b border-blue-500/30 bg-blue-500/10 px-4 py-1.5">
            <span className="text-xs font-medium text-blue-400">A newer version is available</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setNewerVersionAvailable(false)} title="Dismiss">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!activeArtifactId && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Layers className="h-12 w-12 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">No Artifact Selected</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Select a spec or ticket from the dropdowns above, or run a command to generate one.
                </p>
              </div>
            </div>
          )}

          {activeArtifactId && isLoading && !isCurrentArtifactStreaming && mode !== 'edit' && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          )}

          {activeArtifactId && (currentVersion || isCurrentArtifactStreaming || mode === 'edit') && (
            <div className="flex flex-1 flex-col overflow-y-auto">
              <MDXEditor
                key={editorKey}
                ref={editorRef}
                markdown={displayContent}
                readOnly={isReadOnly}
                onChange={handleEditorChange}
                plugins={isReadOnly ? readOnlyPlugins : editPlugins}
                className={cn('artifact-editor flex-1', 'dark-theme dark-editor')}
                contentEditableClassName="prose prose-sm prose-invert max-w-none px-8 py-6"
              />
            </div>
          )}
        </div>
      </div>

      {/* Create Artifact Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New {createModalType === 'spec' ? 'Spec' : 'Ticket'}</DialogTitle>
            <DialogDescription>
              Enter a name for your new {createModalType === 'spec' ? 'spec' : 'ticket'}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="artifact-name">Name</Label>
            <Input
              id="artifact-name"
              placeholder={createModalType === 'spec' ? 'e.g., Authentication Flow Spec' : 'e.g., Implement Login Page'}
              value={createArtifactName}
              onChange={(e) => setCreateArtifactName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isCreating && createArtifactName.trim()) { e.preventDefault(); handleCreateArtifact() } }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button size="sm" onClick={handleCreateArtifact} disabled={isCreating || !createArtifactName.trim()}>
              {isCreating ? 'Creating…' : <><Plus className="mr-1 h-3.5 w-3.5" /> Create</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes confirmation */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='p-2'>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                pendingAction?.onConfirm()
                setPendingAction(null)
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
