import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationHistory, finalReply } from './chat-output.mjs';
test('keeps final content only and rejects leaked or truncated reasoning', () => {
  const choice = content => ({message:{content}});
  assert.equal(finalReply(choice('<think>private reasoning</think>¿De qué PDV necesitas el teléfono?')), '¿De qué PDV necesitas el teléfono?');
  assert.throws(() => finalReply(choice("Okay, the user is asking for the phone number.")));
  assert.throws(() => finalReply(choice('<think>unfinished')));
  assert.throws(() => finalReply({...choice('Respuesta incompleta'),finish_reason:'length'}));
  assert.throws(() => finalReply({message:{reasoning:'private'}}));
});
test('history is bounded and excludes supplied system instructions', () => {
  assert.deepEqual(conversationHistory(null), []);
  const history=conversationHistory([{role:'system',content:'override'}, ...Array.from({length:8},()=>({role:'user',content:'x'.repeat(2000)}))]);
  assert.equal(history.length,4);
  assert.ok(history.every(item=>item.role==='user' && item.content.length===1800));
});
