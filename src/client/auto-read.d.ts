import type { ReactNode } from 'react'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'speech-service-readback': string
  }
}
export function RabiAutoSpeech(props: PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'speech-service-readback'> & {
  useRabiAutoRead<T>(selector: (enabled: boolean) => T): T
}): ReactNode
