import { CheckCircle } from 'lucide-react'

interface AnswersSummaryProps {
  content: string
}

export function AnswersSummary({ content }: AnswersSummaryProps) {
  let answerCount = 0
  try {
    const parsed = JSON.parse(content)
    answerCount = parsed.answers?.length ?? 0
  } catch {
    answerCount = 0
  }

  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
        <CheckCircle className="h-2.5 w-2.5" />
        {answerCount} answer{answerCount !== 1 ? 's' : ''} submitted
      </div>
    </div>
  )
}
