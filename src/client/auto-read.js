import * as React from 'react'
import { RabiSpeechAction } from './reply-player.js'

/** Track only replies arriving after the initial ready Session snapshot. */
export function createRabiReplyGate() {
  let primed = false, lastSeq = -1
  return {
    reset: () => { primed = false; lastSeq = -1 },
    take(snapshot, ready, enabled) {
      if (!ready) { primed = false; return [] }
      const nodes = snapshot.eventNodes
      const newest = nodes.reduce((seq, node) => Math.max(seq, node.seq), lastSeq)
      if (!primed) { primed = true; lastSeq = newest; return [] }
      const replies = enabled ? nodes.filter(node => node.seq > lastSeq && node.kind === 'assistant'
        && node.messageId && !node.interrupted && !node.blocks.some(block => block.kind === 'tool-call')
        && node.blocks.some(block => block.kind === 'text' && block.text.trim())) : []
      lastSeq = newest
      return replies.sort((left, right) => left.seq - right.seq).map(node => node.messageId)
    },
  }
}

/** Read new replies serially in the active Session; unmount stops synthesis and playback. */
export function RabiAutoSpeech({ sessionId, useTrajectory, useSession, useRabiAutoRead, t }) {
  const snapshot = useTrajectory(value => value)
  const ready = useSession(value => value.openState === 'open')
  const enabled = useRabiAutoRead(value => value)
  const gate = React.useRef(null)
  if (!gate.current) gate.current = createRabiReplyGate()
  const [queue, setQueue] = React.useState([])
  const [visible, setVisible] = React.useState(!document.hidden)
  React.useEffect(() => {
    const replies = gate.current.take(snapshot, ready && visible, enabled)
    if (!ready || !enabled || !visible) setQueue(current => current.length ? [] : current)
    else if (replies.length) setQueue(current => [...current, ...replies])
  }, [snapshot, ready, enabled, visible])
  React.useEffect(() => {
    const hide = () => { setVisible(!document.hidden) }
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('visibilitychange', hide) }
  }, [])
  const messageId = queue[0]
  if (!enabled || !ready || !visible || !messageId) return null
  return React.createElement(RabiSpeechAction, {
    key: `${sessionId}:${messageId}`, sessionId, messageId, useTrajectory, t, autoPlay: true,
    onFinished: () => setQueue(current => current.filter(id => id !== messageId)),
  })
}
