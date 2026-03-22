import { Github, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LoginPageProps {
  error?: string | null
}

export function LoginPage({ error }: LoginPageProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-xl border border-border bg-card p-10">
        <div className="flex flex-col items-center gap-3">
          <span className="text-lg font-bold tracking-wider text-foreground">TRAYCER</span>
          <p className="text-center text-sm text-muted-foreground">
            AI-powered engineering workflow assistant
          </p>
        </div>

        {error && (
          <div className="flex w-full items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <a href="/auth/github" className="w-full">
          <Button className="w-full gap-2" size="lg">
            <Github className="h-4 w-4" />
            Sign in with GitHub
          </Button>
        </a>

        <p className="max-w-[260px] text-center text-xs text-muted-foreground/70">
          We'll use your GitHub account to authenticate and optionally connect your repositories.
        </p>
      </div>
    </div>
  )
}
