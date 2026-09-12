import React from 'react';
import { Leaf } from 'lucide-react';

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessageItem {
  id: string;
  role: ChatMessageRole;
  text: string;
}

interface ChatMessageProps {
  message: ChatMessageItem;
  suggestions?: string[];
  onSuggestion?: (suggestion: string) => void;
}

const ChatMessage = ({ message, suggestions = [], onSuggestion }: ChatMessageProps) => {
  if (message.role === 'system') {
    return (
      <div className="px-6 text-center text-xs italic leading-relaxed text-stone-400">
        {message.text}
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <Leaf className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
      <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={[
            'whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed shadow-sm',
            isUser
              ? 'rounded-2xl rounded-tr-sm bg-emerald-600 text-white'
              : 'rounded-2xl rounded-tl-sm border border-stone-100 bg-white text-stone-700',
          ].join(' ')}
        >
          {message.text}
        </div>
        {!isUser && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestion?.(suggestion)}
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-left text-xs font-medium text-emerald-800 transition hover:border-emerald-200 hover:bg-emerald-100"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
