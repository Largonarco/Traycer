import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Settings, Github, Loader2, Check, AlertCircle, Unlink } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useSettings, useGitHubStatus } from '@/hooks/useQueries'
import { settingsApi, githubApi } from '@/lib/api'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

type Provider = 'openai' | 'anthropic'

export function SettingsModal() {
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const setActiveProvider = useUIStore((s) => s.setActiveProvider)
  const queryClient = useQueryClient()

  const { data: settings, isLoading: settingsLoading } = useSettings()
  const { data: githubStatus } = useGitHubStatus()

  const [provider, setProvider] = useState<Provider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inlineError, setInlineError] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)
  const [providerSwitched, setProviderSwitched] = useState(false)

  // When settings load or modal opens, pre-fill provider and sync to store
  useEffect(() => {
    if (settingsOpen && settings) {
      setProvider(settings.provider ?? 'openai')
      setApiKey('')
      setShowKey(false)
      setInlineError('')
      setProviderSwitched(false)
    }
  }, [settingsOpen, settings])

  // Sync activeProvider in uiStore whenever settings are fetched
  useEffect(() => {
    if (settings?.provider) {
      setActiveProvider(settings.provider)
    }
  }, [settings])

  // Reset state when modal closes
  useEffect(() => {
    if (!settingsOpen) {
      setApiKey('')
      setShowKey(false)
      setInlineError('')
      setSaving(false)
      setDisconnecting(false)
      setProviderSwitched(false)
    }
  }, [settingsOpen])

  const handleProviderSwitch = (newProvider: Provider) => {
    if (newProvider !== provider) {
      setProvider(newProvider)
      setApiKey('')
      setShowKey(false)
      setInlineError('')
      setProviderSwitched(newProvider !== (settings?.provider ?? 'openai'))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setInlineError('')

    try {
      await settingsApi.update(provider, apiKey)
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      setActiveProvider(provider)
      toast.success('Settings saved.')
      setSettingsOpen(false)
    } catch (err) {
      setInlineError(
        'API key could not be verified. Please check and try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    setDisconnecting(true)
    try {
      await githubApi.disconnect()
      await queryClient.invalidateQueries({ queryKey: ['github-status'] })
    } catch {
      // Silently handle; status query will reflect actual state
    } finally {
      setDisconnecting(false)
    }
  }

  const isConnected = githubStatus?.connected ?? settings?.githubConnected ?? false

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[460px]" showCloseButton={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your AI provider, API key, and GitHub connection.
          </DialogDescription>
        </DialogHeader>

        {settingsLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading settings...
          </div>
        ) : (
          <div className="space-y-5">
            {/* ── AI Provider Section ──────────────────────────────── */}
            <div className="space-y-2.5">
              <Label>AI Provider</Label>
              <div className="flex rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => handleProviderSwitch('openai')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    provider === 'openai'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  OpenAI
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderSwitch('anthropic')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    provider === 'anthropic'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Anthropic
                </button>
              </div>
            </div>

            {/* ── API Key Section ─────────────────────────────────── */}
            <div className="space-y-2.5">
              <Label htmlFor="api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    if (inlineError) setInlineError('')
                  }}
                  placeholder={settings?.maskedKey ?? `Enter your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`}
                  className="pr-9"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {providerSwitched && settings?.maskedKey
                  ? 'Switching provider requires entering a new API key.'
                  : settings?.maskedKey
                    ? 'Enter a new key to update. The current key is not shown for security.'
                    : `Enter your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key.`}
              </p>
              {inlineError && (
                <div className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{inlineError}</span>
                </div>
              )}
            </div>

            {/* ── Save Button ─────────────────────────────────────── */}
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>

            <Separator />

            {/* ── GitHub Connection Section ────────────────────────── */}
            <div className="space-y-2.5">
              <Label>GitHub Connection</Label>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-muted-foreground" />
                  {isConnected ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                      Not connected
                    </span>
                  )}
                </div>

                {isConnected ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnectGitHub}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Unlink className="mr-1.5 h-3 w-3" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <a href="/auth/github">
                    <Button variant="outline" size="sm">
                      <Github className="mr-1.5 h-3 w-3" />
                      Connect GitHub
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
