import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send } from 'lucide-react';
import { AssistantMessage } from '../types';
import { StatusBadge } from './marketing/StatusBadge';

interface AssistantTabProps {
  onSendMessage: (message: string) => Promise<string>;
  isThinking: boolean;
}

export const AssistantTab: React.FC<AssistantTabProps> = ({
  onSendMessage,
  isThinking,
}) => {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      content:
        'Hello! I am your Zevkar AI assistant. I can inspect your active incidents, client health scores, and recovery priorities. What would you like to review?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'What should I fix first?',
    'Why did the Stripe settlement workflow fail?',
    'Which client has the most failures?',
    'Summarize today’s automation health status',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isThinking) return;

    const userMsg: AssistantMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');

    try {
      const reply = await onSendMessage(text);
      const botMsg: AssistantMessage = {
        id: `msg_bot_${Date.now()}`,
        sender: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: AssistantMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'assistant',
        content: `Error contacting Zevkar AI service: ${err?.message || 'Unknown error'}. Please retry.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Zevkar AI Assistant
          </h2>
          <StatusBadge label="Live Telemetry Grounded" tone="neutral" />
        </div>
        <p className="text-xs text-[#B5AA99] mt-0.5">
          Ask questions about failing workflows, client root causes, prioritizations, and safe recovery steps
        </p>
      </div>

      {/* Quick Inquiries */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-[#B5AA99] font-semibold uppercase tracking-wider mr-1">
          Quick Inquiries:
        </span>
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleSend(prompt)}
            disabled={isThinking}
            className="rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-1.5 text-xs text-[#E9E5DC] transition-colors disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] flex flex-col h-[520px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="h-8 w-8 rounded-md border border-[#383838] bg-[#171717] flex items-center justify-center text-[#C52A18] shrink-0">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </div>
              )}

              <div
                className={`max-w-xl rounded-xl p-4 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#A51B0B] text-[#E9E5DC]'
                    : 'border border-[#383838] bg-[#171717] text-[#E9E5DC] whitespace-pre-line'
                }`}
              >
                <p>{msg.content}</p>
                <span
                  className={`mt-2 block font-mono text-[10px] tabular-nums ${
                    msg.sender === 'user' ? 'text-[#E9E5DC]/80 text-right' : 'text-[#B5AA99]'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>

              {msg.sender === 'user' && (
                <div className="h-8 w-8 rounded-md border border-[#383838] bg-[#171717] flex items-center justify-center text-[#E9E5DC] shrink-0 text-xs font-bold">
                  AM
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-md border border-[#383838] bg-[#171717] text-[#C52A18] flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="rounded-xl border border-[#383838] bg-[#171717] p-4 text-xs text-[#B5AA99]">
                Analyzing live agency telemetry...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-[#383838] bg-[#171717]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Zevkar AI about failures, client impacts, or remediation steps..."
              className="flex-1 rounded-md border border-[#383838] bg-[#202020] px-4 py-2.5 text-xs text-[#E9E5DC] placeholder:text-[#B5AA99]/60"
            />
            <button
              type="submit"
              disabled={isThinking || !input.trim()}
              className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-40 px-4 py-2.5 text-xs font-semibold text-[#E9E5DC] inline-flex items-center gap-1.5 transition-colors"
            >
              <span>Send</span>
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
