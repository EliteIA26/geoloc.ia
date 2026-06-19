"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export default function DepartmentAiChat({ departmentName }: { departmentName: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: `¡Hola! Soy la IA de Agro. ¿Cómo puedo ayudarte con el análisis de la provincia de ${departmentName} hoy?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Mock AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Entendido. Procesando datos de satélite recientes para ${departmentName}... Los índices indican una estabilidad en la vegetación durante las últimas 3 semanas.`,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full glass-panel p-4 rounded-2xl border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl bg-card/80 overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-white/10 mb-3 shrink-0">
        <div className="bg-primary/20 p-2 rounded-full">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Copiloto IA</h3>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{departmentName}</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar min-h-0">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-1 ${msg.role === "user" ? "bg-white/10" : "bg-primary/20"}`}>
                {msg.role === "user" ? <User className="w-3 h-3 text-white" /> : <Bot className="w-3 h-3 text-primary" />}
              </div>
              <div className={`p-2.5 rounded-xl text-xs leading-relaxed max-w-[85%] ${
                msg.role === "user" 
                  ? "bg-white/10 text-white rounded-tr-sm" 
                  : "bg-black/40 text-gray-200 border border-white/5 rounded-tl-sm"
              }`}>
                {msg.content}
              </div>
            </motion.div>
          ))}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex gap-2 flex-row"
            >
              <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-1 bg-primary/20">
                <Bot className="w-3 h-3 text-primary" />
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs text-gray-400 rounded-tl-sm flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Analizando...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="mt-3 relative shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntale a la IA sobre los datos..."
          className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-3 pr-10 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || isTyping}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50 disabled:hover:bg-primary/20 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}} />
    </div>
  );
}
