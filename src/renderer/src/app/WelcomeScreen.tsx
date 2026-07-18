import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, FolderOpen, FileText, Sparkles, Clock, BookOpen, X, FolderPlus, PenLine, Play } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog'
import { useProject } from '../lib/ipc/use-project'
import { useSampleProject } from '../lib/ipc/use-sample-project'
import { useRecentProjects } from '../lib/ipc/use-recent-projects'
import { useErrorStore } from '../lib/store'

const TUTORIAL_SEEN_KEY = 'galide:tutorialSeen'

const hasSeenTutorial = (): boolean => {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(TUTORIAL_SEEN_KEY) === 'true'
}

const markTutorialSeen = (): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TUTORIAL_SEEN_KEY, 'true')
}

const tutorialSteps = [
  {
    icon: FolderPlus,
    title: '创建项目',
    description: '新建或打开一个 Galide 项目,所有剧本以 .gal 文件存放在 scripts/ 目录。'
  },
  {
    icon: PenLine,
    title: '编写剧本',
    description: '用 scene、dialogue、choice、goto 等 DSL 语句书写你的决策树故事。'
  },
  {
    icon: Play,
    title: '预览导出',
    description: '在 PixiJS 预览中试玩,并一键导出为 Web / Ren\'Py / Ink 等格式。'
  }
]

export const WelcomeScreen = (): JSX.Element => {
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('我的 Galgame')
  const [busy, setBusy] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const project = useProject()
  const sampleProject = useSampleProject()
  const { recent, openRecent } = useRecentProjects()
  const pushError = useErrorStore((s) => s.push)

  useEffect(() => {
    if (!hasSeenTutorial()) {
      setShowTutorial(true)
    }
  }, [])

  const handleSkipTutorial = (): void => {
    markTutorialSeen()
    setShowTutorial(false)
  }

  const handleCreateSample = async (): Promise<void> => {
    if (busy || sampleProject.busy) return
    setBusy(true)
    try {
      await sampleProject.create()
    } finally {
      setBusy(false)
    }
  }

  const handleNew = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const result = await project.create(name)
      if (!result || !result.ok) {
        if (result?.error && result.error !== 'canceled') {
          pushError({ code: 'PROJECT_CREATE_FAILED', message: result.error, source: 'project:create' })
        }
      }
    } finally {
      setBusy(false)
      setShowNew(false)
    }
  }

  const handleOpen = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await project.open()
    } finally {
      setBusy(false)
    }
  }

  const handleOpenRecent = async (path: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const result = await openRecent(path)
      if (result && !result.ok && result.error && result.error !== 'canceled') {
        pushError({
          code: 'PROJECT_OPEN_FAILED',
          message: result.error,
          source: 'project:openPath'
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex-1 flex items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--gradient)' }}
    >
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E\")"
        }}
      />
      <div className="grid grid-cols-2 gap-16 max-w-5xl w-full px-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col justify-center"
        >
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium text-text-muted tracking-wide">AI-native Galgame IDE</span>
          </div>
          <h1 className="text-5xl font-semibold tracking-tight mb-4 text-text">Galide</h1>
          <p className="text-lg text-text-muted leading-relaxed mb-8">
            打开galide和ai合作书写你的故事
          </p>
          <div className="flex flex-col gap-3 max-w-sm">
            <Button size="lg" onClick={() => setShowNew(true)} disabled={busy} className="justify-start">
              <Plus className="w-4 h-4" />
              新建项目
            </Button>
            <Button size="lg" variant="secondary" onClick={handleOpen} disabled={busy} className="justify-start">
              <FolderOpen className="w-4 h-4" />
              打开项目
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => void handleCreateSample()}
              disabled={busy || sampleProject.busy}
              className="justify-start"
              data-testid="welcome-open-sample"
            >
              <BookOpen className="w-4 h-4" />
              打开示例项目
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
          className="flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3 text-text-muted">
            <Clock className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider font-medium">最近项目</span>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto max-h-96">
            {recent.length === 0 ? (
              <div className="border border-dashed border-border rounded-2xl p-8 text-center">
                <BookOpen className="w-8 h-8 mx-auto mb-3 text-text-muted opacity-50" />
                <p className="text-sm text-text-muted">还没有项目。创建一个开始你的故事。</p>
              </div>
            ) : (
              recent.map((r) => (
                <button
                  key={r.path}
                  onClick={() => void handleOpenRecent(r.path)}
                  className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-accent hover:shadow-sm transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-text">{r.name}</div>
                    <div className="text-xs text-text-muted truncate">{r.path}</div>
                  </div>
                  <div className="text-xs text-text-muted shrink-0">
                    {new Date(r.lastOpened).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>选择一个目录作为项目根,Galide 会在其中创建 .galproj 清单和 scripts/ 目录。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-text-muted">项目名</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) void handleNew()
              }}
              placeholder="我的 Galgame"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)} disabled={busy}>
              取消
            </Button>
            <Button onClick={() => void handleNew()} disabled={busy || !name.trim()}>
              {busy ? '创建中…' : '选择目录并创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/5"
            data-testid="tutorial-overlay"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="pointer-events-auto w-full max-w-md mx-4 bg-surface border border-border rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-text">新手引导</h2>
                  <p className="text-sm text-text-muted">3 个步骤快速上手 Galide</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSkipTutorial}
                  aria-label="跳过引导"
                  data-testid="tutorial-skip"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 mb-6">
                {tutorialSteps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div
                      key={step.title}
                      className="flex items-start gap-3 p-3 rounded-xl bg-bg-elevated/50 border border-border"
                    >
                      <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-accent">{index + 1}</span>
                          <h3 className="text-sm font-medium text-text">{step.title}</h3>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed mt-1">{step.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Button onClick={handleSkipTutorial} className="w-full" data-testid="tutorial-skip-primary">
                跳过
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
