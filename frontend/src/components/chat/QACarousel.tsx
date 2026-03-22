import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react'

export interface Question {
  id: string
  statement: string
  description: string
  options: string[]
  multiselect: boolean
}

interface QACarouselProps {
  questions: Question[]
  onSubmit: (answers: Array<{ questionId: string; selectedOptions: string[] }>) => void
  locked?: boolean
  isSubmitting?: boolean
}

export function QACarousel({ questions, onSubmit, locked = false, isSubmitting = false }: QACarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})

  const currentQuestion = questions[currentIndex]
  const totalQuestions = questions.length

  const selectedOptions = answers[currentQuestion?.id] ?? []

  const toggleOption = useCallback(
    (option: string) => {
      if (locked) return
      const qId = currentQuestion.id

      setAnswers((prev) => {
        const current = prev[qId] ?? []
        if (currentQuestion.multiselect) {
          // Toggle in multi-select mode
          const next = current.includes(option)
            ? current.filter((o) => o !== option)
            : [...current, option]
          return { ...prev, [qId]: next }
        } else {
          // Single-select: replace
          return { ...prev, [qId]: [option] }
        }
      })
    },
    [currentQuestion, locked]
  )

  const allAnswered = questions.every((q) => (answers[q.id] ?? []).length > 0)

  const handleSubmit = () => {
    if (!allAnswered || locked) return
    const formatted = questions.map((q) => ({
      questionId: q.id,
      selectedOptions: answers[q.id] ?? [],
    }))
    onSubmit(formatted)
  }

  if (locked) {
    const answeredCount = Object.keys(answers).length || questions.length
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span>{answeredCount} question{answeredCount !== 1 ? 's' : ''} answered</span>
      </div>
    )
  }

  if (!currentQuestion) return null

  const answeredCount = questions.filter((q) => (answers[q.id] ?? []).length > 0).length

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-card p-2.5">
      {/* Progress indicator */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          Question {currentIndex + 1} of {totalQuestions}
        </span>
        {allAnswered ? (
          <span className="text-[11px] font-medium text-primary">All answered</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {answeredCount}/{totalQuestions} answered
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i === currentIndex
                ? 'bg-primary'
                : (answers[questions[i].id] ?? []).length > 0
                ? 'bg-primary/40'
                : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Question */}
      <div>
        <p className="text-xs font-medium text-foreground">{currentQuestion.statement}</p>
        {currentQuestion.description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{currentQuestion.description}</p>
        )}
        {currentQuestion.multiselect && (
          <p className="mt-1 text-[9px] text-muted-foreground/70">Select all that apply</p>
        )}
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-1.5">
        {currentQuestion.options.map((option) => {
          const isSelected = selectedOptions.includes(option)
          return (
            <button
              key={option}
              onClick={() => toggleOption(option)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                isSelected
                  ? 'border-primary/50 bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>

      {/* Navigation + Submit */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-xs"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
            disabled={currentIndex === totalQuestions - 1}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!allAnswered || isSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Submit All
        </Button>
      </div>
    </div>
  )
}
