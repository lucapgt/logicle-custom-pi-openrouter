import { delete_, get, patch, post } from '@/lib/fetch'
import { mutate as globalMutate } from 'swr'
import { unstable_serialize } from 'swr/infinite'
import * as dto from '@/types/dto'

export const conversationListKey = '/api/conversations'

export const isConversationListKey = (key: unknown): key is string =>
  key === conversationListKey ||
  (typeof key === 'string' && key.startsWith(`${conversationListKey}?`))

export const conversationListInfiniteKey = unstable_serialize(
  (pageIndex: number, previousPageData: dto.ConversationPage | null) => {
    if (pageIndex === 0) {
      return conversationListKey
    }
    if (!previousPageData?.nextCursor) {
      return null
    }
    return `${conversationListKey}?cursor=${encodeURIComponent(previousPageData.nextCursor)}`
  }
)

export const mutateConversationList = async () => {
  await Promise.all([
    globalMutate(isConversationListKey),
    globalMutate(conversationListInfiniteKey),
  ])
}

export const getConversation = async (conversationId: string) => {
  return await get<dto.Conversation>(`/api/conversations/${conversationId}`)
}

export const getConversationMessages = async (conversationId: string) => {
  return await get<dto.Message[]>(`/api/conversations/${conversationId}/messages`)
}

export const createConversation = async (conversation: dto.InsertableConversation) => {
  return await post<dto.Conversation>(`/api/conversations`, conversation)
}

export const saveConversation = async (
  conversationId: string,
  data: dto.UpdateableConversation
) => {
  return await patch<void>(`/api/conversations/${conversationId}`, data)
}

export const deleteConversation = async (conversationId: string) => {
  return await delete_(`/api/conversations/${conversationId}`)
}
