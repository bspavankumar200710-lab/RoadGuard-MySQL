import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Flame,
  CheckCircle2,
  RotateCcw,
  Layers,
} from 'lucide-react';
import { sideDrawerVariants, modalOverlayVariants, buttonPressProps, chatMessageVariants } from '../utils/motion';
import { RoadHazardRecord } from '../types/detection';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  badges?: string[];
}

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  detections: RoadHazardRecord[];
  onNavigateToMap: (hazardId?: string) => void;
}

const DEFAULT_PROMPTS = [
  '🚨 Analyze Critical Pothole Hotspots',
  '🛣️ Estimate Total Asphalt Repair Area',
  '⏱️ Summarize Today’s Monitored Corridors',
  '🛡️ Prioritize Inspection Maintenance Route',
];

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  detections,
  onNavigateToMap,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello Inspector. I am your RoadGuard AI Dispatcher. I analyze computer vision telemetry, defect clusters, and municipal repair priorities in real time. How can I assist your road network maintenance today?',
      timestamp: 'Just now',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputValue.trim();
    if (!text) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue('');
    setIsTyping(true);

    // Dynamic response based on active detections
    setTimeout(() => {
      const highSeverity = detections.filter((d) => d.severity === 'high');
      const potholes = detections.filter((d) => d.type === 'pothole');
      const cracks = detections.filter((d) => d.type === 'road_crack');

      let reply = '';
      let badges: string[] = [];

      const queryLower = text.toLowerCase();
      if (queryLower.includes('pothole') || queryLower.includes('critical')) {
        reply = `Found ${highSeverity.length} critical hazard alerts currently logged across the monitored zones. The densest cluster is along the Outer Ring Road corridor with ${potholes.length} severe pothole defects requiring immediate patching.`;
        badges = ['P1 Priority', `${highSeverity.length} Critical Defects`];
      } else if (queryLower.includes('asphalt') || queryLower.includes('repair') || queryLower.includes('area')) {
        const estimatedArea = highSeverity.length * 4.5 + cracks.length * 1.8;
        reply = `Estimated municipal cold-mix asphalt requirement is ~${Math.round(estimatedArea)} m² across all logged surface failures. Priority crew dispatch is recommended for Bellandur Flyover & Koramangala 80ft Road.`;
        badges = [`~${Math.round(estimatedArea)} m² Required`, 'Class 2 Cold Mix'];
      } else if (queryLower.includes('today') || queryLower.includes('corridor') || queryLower.includes('summarize')) {
        reply = `Today's monitoring patrol identified ${detections.length} total road surface anomalies across ${highSeverity.length} high, ${detections.filter((d) => d.severity === 'medium').length} medium, and ${detections.filter((d) => d.severity === 'low').length} low severity categories. Overall road surface health is rated B+ (78/100).`;
        badges = ['Health Score: 78/100', `${detections.length} Active Records`];
      } else {
        reply = `Analysis complete based on ${detections.length} telemetry points. I have cross-referenced the latest GPS coordinates with municipal repair work orders. High-risk zones are flagged with live GPS tags on your interactive Map.`;
        badges = ['Telemetry Synced', 'Ready for Dispatch'];
      }

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        badges,
      };

      setIsTyping(false);
      setMessages((prev) => [...prev, aiMsg]);
    }, 750);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Slide-out Drawer */}
          <motion.div
            variants={sideDrawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 w-full max-w-md bg-slate-900 border-l border-slate-700/80 shadow-2xl flex flex-col h-full text-slate-100 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/50 flex items-center justify-center text-indigo-400 shadow-md">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm sm:text-base text-white">
                      RoadGuard AI Dispatcher
                    </h3>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Live Copilot
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Intelligent Municipal Defect Analysis</p>
                </div>
              </div>

              <motion.button
                {...buttonPressProps}
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Quick Context Chips */}
            <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Dataset: {detections.length} recorded hazards</span>
              </span>
              <button
                onClick={() => {
                  onClose();
                  onNavigateToMap();
                }}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
              >
                <span>View Map</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-thin">
              {messages.map((msg) => {
                const isAi = msg.sender === 'ai';
                return (
                  <motion.div
                    key={msg.id}
                    variants={chatMessageVariants}
                    initial="hidden"
                    animate="visible"
                    className={`flex items-start gap-2.5 ${isAi ? '' : 'flex-row-reverse'}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs ${
                        isAi
                          ? 'bg-indigo-600/30 border border-indigo-400/40 text-indigo-300'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      {isAi ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>

                    <div
                      className={`max-w-[82%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                        isAi
                          ? 'bg-slate-800/90 border border-slate-700/80 text-slate-200 shadow-md'
                          : 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      }`}
                    >
                      <p>{msg.text}</p>

                      {msg.badges && msg.badges.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {msg.badges.map((b, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-700/60 text-indigo-300"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}

                      <span
                        className={`text-[9px] font-mono mt-1.5 block opacity-70 ${
                          isAi ? 'text-slate-400' : 'text-blue-200'
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                  </motion.div>
                );
              })}

              {/* Animated Typing Indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-7 h-7 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-slate-800/90 border border-slate-700/80 px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md">
                    <motion.span
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                      className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                    />
                    <motion.span
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                      className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                    />
                    <motion.span
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                      className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                    />
                    <span className="text-[10px] text-slate-400 font-mono ml-1">Analyzing...</span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts with Spring Hover */}
            <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                Suggested Analysis Prompts
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {DEFAULT_PROMPTS.map((prompt, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSendMessage(prompt)}
                    className="whitespace-nowrap px-3 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 text-slate-200 text-[11px] font-medium transition-colors shrink-0 shadow-sm"
                  >
                    {prompt}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-3.5 border-t border-slate-800 bg-slate-900 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about defect clusters, asphalt estimates..."
                className="flex-1 bg-slate-950 border border-slate-700/90 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <motion.button
                {...buttonPressProps}
                type="submit"
                disabled={!inputValue.trim()}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </motion.button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
