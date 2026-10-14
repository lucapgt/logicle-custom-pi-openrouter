'use client'
import { useContext, useEffect, useRef, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInputOrApiKey } from './ChatInputOrApiKey'
import { groupMessages } from '@/lib/chat/conversationUtils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconArrowDown } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { useChatInput } from '@/components/providers/localstoragechatstate'
import { MessageGroup } from './MessageGroup'
import { ConversationSidebar } from './ConversationSidebar'
import { useTranslation } from 'react-i18next'
import { useTokenRateLimit } from '@/components/providers/tokenRateLimitContext'
import { TokenRateLimitBanner } from './TokenRateLimitBanner'
import { MessageLimitBanner } from './MessageLimitBanner'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'
import { PiV4InlineChat } from './PiV4InlineChat'

export interface ChatProps {
  assistant: dto.AssistantIdentification & {
    usability: dto.AssistantUsability
    model: string
    tokenLimit: number
    systemPrompt?: string
    files?: dto.AssistantFile[]
  }
  supportedMedia: string[]
  draftAssistantForEstimate?: dto.AssistantDraft
  initialServerContextTokens?: number
  onServerContextTokensChange?: (tokens: number) => void
  className?: string
}

export const Chat = ({
  assistant,
  className,
  supportedMedia,
  draftAssistantForEstimate,
  initialServerContextTokens,
  onServerContextTokensChange,
}: ChatProps) => {
  const {
    state: { selectedConversation, chatStatus, sideBarContent },
    sendMessage,
    setSideBarContent,
  } = useContext(ChatPageContext)
  const tokenRateLimit = useTokenRateLimit()
  const environment = useEnvironment()
  const { isMobile } = useLayoutConfig()
  const { t } = useTranslation()

  const [chatInput, setChatInput] = useChatInput(selectedConversation?.id ?? '')
  const [piV4Session, setPiV4Session] = useState<string | null>(null)
  const [modeLoading, setModeLoading] = useState(false)
  const [v4Available, setV4Available] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activationError, setActivationError] = useState('')
  const [modeError, setModeError] = useState(false)
  useEffect(() => {
    const conversationId = selectedConversation?.id
    if (!conversationId) { setPiV4Session(null); return }
    let cancelled = false
    setPiV4Session(null)
    setV4Available(false)
    setModeError(false)
    setModeLoading(true)
    void fetch('/api/pi-v4/conversations/' + encodeURIComponent(conversationId) + '/binding', { credentials:'same-origin',cache:'no-store' })
      .then(r => {if(!r.ok) throw Error('Binding lookup failed');return r.json()})
      .then((data: { mode: string; sessionId: string|null; available: boolean }) => {
        if(!cancelled) {setPiV4Session(data.mode==='pi-v4'?data.sessionId:null);setV4Available(data.available)}
      })
      .catch(()=>{if(!cancelled) {setPiV4Session(null); setModeError(true)}})
      .finally(()=>{if(!cancelled) setModeLoading(false)})
    return ()=>{cancelled=true}
  },[selectedConversation?.id])
  const activatePiV4 = async () => {
    const conversationId = selectedConversation?.id
    if (!conversationId || activating || !v4Available || piV4Session) return
    setActivating(true)
    setActivationError('')
    try {
      const list = await fetch('/api/pi-v4/satellites', { credentials: 'same-origin' })
      if (!list.ok) throw Error('Unable to list your satellites')
      const data = await list.json() as { satellites: Array<{ id: string; name: string }> }
      if (!data.satellites.length) throw Error('No satellite registered for this user')
      const satellite = data.satellites.length === 1 ? data.satellites[0] :
        data.satellites.find(s => window.confirm('Selezionare il satellite ' + s.name + '?'))
      if (!satellite) return
      if (!window.confirm('Creare una nuova sessione Pi Native V4 per questa conversazione? Lo storico precedente restera in Logicle ma non sara importato nel contesto Pi.')) return
      const r = await fetch('/api/pi-v4/conversations/' + encodeURIComponent(conversationId) + '/binding', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ satelliteId: satellite.id }),
      })
      if (!r.ok) throw Error('Pi activation HTTP ' + r.status)
      const result = await r.json() as { sessionId: string|null; mode: string }
      if (result.mode !== 'pi-v4' || !result.sessionId) throw Error('Invalid V4 mode response')
      setPiV4Session(result.sessionId)
    } catch(error) { setActivationError(String(error)) }
    finally { setActivating(false) }
  }
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true)
  const [showScrollDownButton, setShowScrollDownButton] = useState<boolean>(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const scrolledToFragmentRef = useRef(false)

  useEffect(() => {
    setSideBarContent?.(undefined)
  }, [])
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
      const bottomTolerance = 30
      if (scrollTop + clientHeight < scrollHeight - bottomTolerance) {
        setAutoScrollEnabled(false)
        setShowScrollDownButton(true)
      } else {
        setAutoScrollEnabled(true)
        setShowScrollDownButton(false)
      }
    }
  }

  const handleScrollDown = () => {
    chatContainerRef.current?.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }

  const scrollDown = () => {
    if (autoScrollEnabled && !scrolledToFragmentRef.current) {
      messagesEndRef.current?.scrollIntoView()
    }
  }
  const throttledScrollDown = throttle(scrollDown, 250)

  useEffect(() => {
    scrolledToFragmentRef.current = false
  }, [selectedConversation?.id])

  useEffect(() => {
    if (scrolledToFragmentRef.current) return
    const hash = window.location.hash
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    const container = chatContainerRef.current
    if (!el || !container) return
    scrolledToFragmentRef.current = true
    setAutoScrollEnabled(false)
    const elTop =
      el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    container.scrollTo({
      top: elTop - (container.clientHeight - el.offsetHeight) / 2,
      behavior: 'smooth',
    })
  }, [selectedConversation])

  useEffect(() => {
    throttledScrollDown()
  }, [selectedConversation, throttledScrollDown, chatStatus])

  if (!selectedConversation) {
    return null
  }
  let streamingMessageId: string | undefined
  if (chatStatus.state !== 'idle' && selectedConversation.messages.length) {
    const lastMessage = selectedConversation.messages[selectedConversation.messages.length - 1]
    if (lastMessage.role === 'assistant' || lastMessage.role === 'tool') {
      streamingMessageId = lastMessage.id
    }
  }
  const groupList = groupMessages(
    selectedConversation.messages,
    selectedConversation.targetLeaf,
    streamingMessageId
  )
  const userMessageCount = groupList.filter((g) => g.actor === 'user').length
  const hardMessageLimitReached =
    environment.hardMessageLimit !== undefined && userMessageCount >= environment.hardMessageLimit
  const softMessageLimitReached =
    !hardMessageLimitReached &&
    environment.softMessageLimit !== undefined &&
    userMessageCount >= environment.softMessageLimit

  return (
    <div className={`relative flex min-w-0 overflow-hidden gap-4 ${className ?? ''}`}>
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden`}>
        <ScrollArea
          className="max-h-full flex-1 overflow-x-hidden relative"
          ref={chatContainerRef}
          onScroll={handleScroll}
        >
          <div className="max-w-[var(--thread-content-max-width)] mx-auto">
            {groupList.map((group, index) => (
              <MessageGroup
                key={index}
                assistant={assistant}
                group={group}
                isLast={index + 1 === groupList.length}
              />
            ))}
            <div className="h-[1px]" ref={messagesEndRef} />
          </div>
          {showScrollDownButton && (
            <div className="absolute bottom-4 right-1/2">
              <button
                type="button"
                title={t('scroll-to-end-of-conversation')}
                aria-label={t('scroll-to-end-of-conversation')}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-foreground shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={handleScrollDown}
              >
                <IconArrowDown size={18} />
              </button>
            </div>
          )}
        </ScrollArea>
        <div className="mx-auto w-full max-w-[var(--thread-content-max-width)] px-3 py-2 text-sm" aria-live="polite">
          Modalità: {modeLoading ? 'verifica...' : piV4Session ? 'Pi Native V4 (sessione associata)' : 'Assistente Logicle'}
          {!modeLoading && v4Available && !piV4Session && (
            <button type="button" disabled={activating} className="ml-3 rounded border px-3 py-1"
              onClick={() => void activatePiV4()}>
              {activating ? 'Attivazione...' : 'Converti in Pi Native V4'}
            </button>
          )}
          {activationError && <p role="alert" className="text-red-600">{activationError}</p>}
        </div>
        {modeLoading ? <p role="status" className="p-3 text-sm">Verifica modalità della conversazione...</p> : modeError ? <p role="alert" className="p-3 text-sm">Impossibile verificare la modalità della conversazione. Riapri la chat prima di inviare altri messaggi.</p> : piV4Session ? <PiV4InlineChat sessionId={piV4Session} conversationId={selectedConversation.id} /> : <ChatInputOrApiKey
          assistant={assistant}
          chatInput={chatInput}
          setChatInput={setChatInput}
          supportedMedia={supportedMedia}
          modelId={assistant.model}
          userMessageCount={userMessageCount}
          draftAssistantForEstimate={draftAssistantForEstimate}
          draftMessagesForEstimate={selectedConversation.messages}
          initialServerContextTokens={initialServerContextTokens}
          onServerContextTokensChange={onServerContextTokensChange}
          conversationId={selectedConversation.id}
          targetMessageId={selectedConversation.targetLeaf ?? undefined}
          tokenLimit={assistant.tokenLimit}
          autoFocus
          onSend={({ content, attachments }) => {
            setAutoScrollEnabled(true)
            messagesEndRef.current?.scrollIntoView()
            sendMessage?.({
              msg: { role: 'user', content, attachments },
            })
          }}
        />}
        {(hardMessageLimitReached || softMessageLimitReached) && (
          <MessageLimitBanner
            variant={hardMessageLimitReached ? 'block' : 'warning'}
            count={
              hardMessageLimitReached
                ? environment.hardMessageLimit ?? userMessageCount
                : environment.softMessageLimit ?? userMessageCount
            }
          />
        )}
        {tokenRateLimit?.enabled && tokenRateLimit.exceeded && <TokenRateLimitBanner />}
      </div>
      {sideBarContent && (
        <ConversationSidebar
          content={sideBarContent}
          className={isMobile ? 'absolute inset-0 z-20 bg-background p-3 shadow-xl' : undefined}
        />
      )}
    </div>
  )
}
Chat.displayName = 'Chat'

function throttle<T extends (...args: unknown[]) => unknown>(func: T, limit: number): T {
  let lastFunc: ReturnType<typeof setTimeout>
  let lastRan: number

  return ((...args) => {
    if (!lastRan) {
      func(...args)
      lastRan = Date.now()
    } else {
      clearTimeout(lastFunc)
      lastFunc = setTimeout(
        () => {
          if (Date.now() - lastRan >= limit) {
            func(...args)
            lastRan = Date.now()
          }
        },
        limit - (Date.now() - lastRan)
      )
    }
  }) as T
}
