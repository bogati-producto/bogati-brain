export function conversationHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .slice(-4).map(item => ({ role: item.role, content: item.content.slice(0, 1800) }));
}

export function finalReply(choice) {
  if (choice?.finish_reason === 'length') throw new Error('truncated_reply');
  const content = choice?.message?.content;
  if (typeof content !== 'string') throw new Error('empty_reply');
  const reply = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!reply || /<\/?think>|\b(?:the user is asking|the user's (?:question|query)|let me (?:think|double-check)|looking at the (?:history|provided documents)|el usuario (?:está preguntando|pregunta)|debo responder)\b/i.test(reply)) {
    throw new Error('internal_reasoning_reply');
  }
  return reply;
}
