import { inflateSync } from 'node:zlib';
import { WORD_CHAIN_ENGLISH_DATA } from '@/lib/word-chain-english-data';

let englishWords: Set<string> | undefined;

// Inflate once per process on the first guess, then use an O(1) exact lookup.
// No AI, network request, automatic correction, or theme classification.
export function isSpelledWordChainWord(word: string): boolean {
  if (!/^[a-z]{3,40}$/i.test(word)) return false;
  englishWords ||= new Set(inflateSync(Buffer.from(WORD_CHAIN_ENGLISH_DATA, 'base64')).toString('utf8').split('\n'));
  return englishWords.has(word.toLowerCase());
}
