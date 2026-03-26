import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, 
  MessageSquare, 
  Search, 
  Plus, 
  ChevronRight,
  CheckCircle2,
  FileText,
  Send,
  Loader2,
  ArrowLeft,
  X,
  Download,
  Lightbulb,
  HelpCircle,
  BookOpen,
  Trophy,
  AlertCircle
} from 'lucide-react';
import { 
  generateQuiz, 
  getExplanationStream, 
  getQuestionHelp,
  getQuizFeedback,
  Quiz, 
  QuizQuestion 
} from './services/geminiService';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { cn } from './utils';
import { supabase } from './lib/supabase';

type View = 'dashboard' | 'quiz' | 'tutor' | 'history';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Quiz State
  const [quizTopic, setQuizTopic] = useState('');
  const [quizType, setQuizType] = useState('Kiểm tra kiến thức');
  const [quizDifficulty, setQuizDifficulty] = useState('Trung bình');
  const [quizGrade, setQuizGrade] = useState('12');
  const [quizSubject, setQuizSubject] = useState('Toán');
  const [quizExamPeriod, setQuizExamPeriod] = useState('Giữa kì 1');
  const [quizQuestionCount, setQuizQuestionCount] = useState(10);
  const [quizTimeLimit, setQuizTimeLimit] = useState(15);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [generatedQuiz, setGeneratedQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<any[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeHelp, setActiveHelp] = useState<{index: number, content: string, type: string} | null>(null);
  const [helpLoading, setHelpLoading] = useState<number | null>(null);

  // Tutor State
  const [tutorQuery, setTutorQuery] = useState('');
  const [tutorImage, setTutorImage] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState('Toán');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  const quizResultRef = React.useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    if (isAtBottom && chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  React.useEffect(() => {
    let timer: any;
    if (isTimerRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      handleQuizSubmit();
    }
    return () => clearInterval(timer);
  }, [isTimerRunning, timeLeft]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('history')
        .select(`
          *,
          quizzes (
            title,
            content
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error("Fetch History Error:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveToHistory = async (quizId: string, score: number, answers: any[], feedback: string) => {
    try {
      const { error } = await supabase
        .from('history')
        .insert([
          { 
            quiz_id: quizId, 
            score, 
            user_answers: answers, 
            feedback 
          }
        ]);
      if (error) throw error;
    } catch (err) {
      console.error("Save History Error:", err);
    }
  };

  const saveQuiz = async (quiz: Quiz) => {
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .insert([
          { title: quiz.title, content: quiz }
        ])
        .select();
      if (error) throw error;
      return data[0].id;
    } catch (err) {
      console.error("Save Quiz Error:", err);
      return null;
    }
  };

  const handleQuizSubmit = async () => {
    if (!generatedQuiz) return;
    
    setIsTimerRunning(false);
    setQuizSubmitted(true);
    
    // Scroll to top of results
    setTimeout(() => {
      quizResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    
    // Calculate score
    let correct = 0;
    generatedQuiz.questions.forEach((q, i) => {
      if (String(q.correctAnswer) === String(userAnswers[i])) {
        correct++;
      }
    });
    const score = (correct / generatedQuiz.questions.length) * 10;
    setQuizScore(score);
    
    // Get feedback
    setFeedbackLoading(true);
    try {
      const feedback = await getQuizFeedback(generatedQuiz, userAnswers);
      const fbText = feedback || "Không có nhận xét.";
      setQuizFeedback(fbText);

      // Save to Supabase
      const quizId = await saveQuiz(generatedQuiz);
      if (quizId) {
        await saveToHistory(quizId, score, userAnswers, fbText);
      }
    } catch (err) {
      console.error(err);
      setQuizFeedback("Không thể lấy nhận xét từ AI lúc này.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const subjects = ['Toán', 'Văn', 'Anh', 'Lý', 'Hóa', 'Địa', 'Sinh', 'Sử'];

  const handleGenerateQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateQuiz(
        quizTopic, 
        quizType, 
        quizDifficulty,
        quizGrade,
        quizSubject,
        quizType === 'Đề thi' ? quizExamPeriod : undefined,
        quizType === 'Kiểm tra kiến thức' ? quizQuestionCount : undefined
      );

      let timeInSeconds = 0;
      if (quizType === 'Kiểm tra kiến thức') {
        timeInSeconds = quizTimeLimit * 60;
      } else {
        // Standard exam time based on subject
        if (['Toán', 'Văn'].includes(quizSubject)) {
          timeInSeconds = 90 * 60;
        } else {
          timeInSeconds = 45 * 60;
        }
      }

      setGeneratedQuiz(res);
      setUserAnswers(new Array(res.questions.length).fill(null));
      setQuizSubmitted(false);
      setQuizScore(0);
      setQuizFeedback(null);
      setActiveHelp(null);
      setTimeLeft(timeInSeconds);
      setIsTimerRunning(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Có lỗi xảy ra khi tạo đề thi. Vui lòng kiểm tra lại kết nối mạng.");
    } finally {
      setLoading(false);
    }
  };

  const handleGetHelp = async (index: number, helpType: 'hint' | 'method' | 'solution') => {
    if (!generatedQuiz) return;
    setHelpLoading(index);
    try {
      const content = await getQuestionHelp(generatedQuiz.questions[index].question, helpType);
      setActiveHelp({ index, content: content || '', type: helpType });
    } catch (err: any) {
      console.error(err);
      alert("AI không thể phản hồi lúc này. Vui lòng thử lại sau.");
    } finally {
      setHelpLoading(null);
    }
  };

  const downloadPDF = () => {
    if (!generatedQuiz) return;
    try {
      const doc = new jsPDF();
      
      // Helper to clean LaTeX for PDF
      const cleanText = (text: string) => {
        return text.replace(/\$/g, '').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/\\sqrt\{([^}]*)\}/g, '√$1');
      };

      let y = 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      const title = cleanText(generatedQuiz.title);
      doc.text(title, 105, y, { align: 'center' });
      y += 15;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      generatedQuiz.questions.forEach((q, i) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        
        const questionText = `${i + 1}. ${cleanText(q.question)}`;
        const splitQuestion = doc.splitTextToSize(questionText, 180);
        doc.text(splitQuestion, 10, y);
        y += splitQuestion.length * 7;

        if (q.options) {
          q.options.forEach((opt, j) => {
            if (y > 280) {
              doc.addPage();
              y = 20;
            }
            const optText = `   ${String.fromCharCode(65 + j)}. ${cleanText(opt)}`;
            const splitOpt = doc.splitTextToSize(optText, 170);
            doc.text(splitOpt, 15, y);
            y += splitOpt.length * 6;
          });
        }
        y += 5;
      });

      // Add Answer Key
      doc.addPage();
      y = 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("DAP AN VA GIAI THICH", 105, y, { align: 'center' });
      y += 15;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      generatedQuiz.questions.forEach((q, i) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const ans = q.correctAnswer !== null ? (typeof q.correctAnswer === 'number' ? String.fromCharCode(65 + q.correctAnswer) : q.correctAnswer) : 'Tu luan';
        const ansText = `${i + 1}. Dap an: ${ans}`;
        doc.text(ansText, 10, y);
        y += 6;
        const expText = `Giai thich: ${cleanText(q.explanation)}`;
        const splitExp = doc.splitTextToSize(expText, 180);
        doc.text(splitExp, 10, y);
        y += splitExp.length * 5 + 5;
      });

      doc.save(`${generatedQuiz.title.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error("PDF Error:", err);
      alert("Lỗi khi tạo PDF. Vui lòng thử tải bản DOCX.");
    }
  };

  const downloadDOC = async () => {
    if (!generatedQuiz) return;
    try {
      const cleanText = (text: string) => {
        return text.replace(/\$/g, '');
      };

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun({ text: generatedQuiz.title, bold: true, size: 32 })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 }
            }),
            ...generatedQuiz.questions.flatMap((q, i) => [
              new Paragraph({
                children: [new TextRun({ text: `${i + 1}. ${cleanText(q.question)}`, bold: true, size: 24 })],
                spacing: { before: 200, after: 100 },
              }),
              ...(q.options || []).map((opt, j) => new Paragraph({
                children: [new TextRun({ text: `${String.fromCharCode(65 + j)}. ${cleanText(opt)}`, size: 22 })],
                indent: { left: 720 },
                spacing: { after: 50 }
              }))
            ]),
            new Paragraph({
              children: [new TextRun({ text: "ĐÁP ÁN VÀ GIẢI THÍCH", bold: true, size: 28, break: 2 })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 400, after: 200 }
            }),
            ...generatedQuiz.questions.flatMap((q, i) => [
              new Paragraph({
                children: [
                  new TextRun({ text: `${i + 1}. Đáp án: ${q.correctAnswer !== null ? (typeof q.correctAnswer === 'number' ? String.fromCharCode(65 + q.correctAnswer) : q.correctAnswer) : 'Tự luận'}`, bold: true, size: 22 }),
                ],
                spacing: { before: 100 }
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Giải thích: ${cleanText(q.explanation)}`, size: 20, italics: true })
                ],
                spacing: { after: 200 }
              })
            ])
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${generatedQuiz.title.replace(/\s+/g, '_')}.docx`);
    } catch (err) {
      console.error("DOCX Error:", err);
      alert("Lỗi khi tạo file DOCX. Vui lòng thử lại.");
    }
  };

  const handleTutorQuery = async () => {
    if (!tutorQuery && !tutorImage) return;
    const query = tutorQuery;
    const image = tutorImage;
    setTutorQuery('');
    setTutorImage(null);
    
    const userMsg = { role: 'user' as const, content: query || 'Phân tích hình ảnh này' };
    setChatHistory(prev => [...prev, userMsg]);
    
    setLoading(true);
    try {
      const stream = await getExplanationStream(
        query || 'Hãy phân tích hình ảnh này và giải thích các kiến thức liên quan.', 
        image || undefined
      );
      
      let aiContent = '';
      // Add an empty AI message that we will update
      setChatHistory(prev => [...prev, { role: 'ai', content: '' }]);
      
      for await (const chunk of stream) {
        aiContent += chunk.text || '';
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { role: 'ai', content: aiContent };
          return newHistory;
        });
      }
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: 'ai', content: 'Xin lỗi, đã có lỗi xảy ra khi kết nối với AI.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTutorImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-12 py-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-5xl text-slate-900 mb-3 font-display font-bold tracking-tight">Chào mừng bạn!</h1>
          <p className="text-slate-500 text-lg">Hôm nay bạn muốn học gì? Hãy để AI đồng hành cùng bạn.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[
          { 
            id: 'quiz', 
            title: 'Luyện tập & Kiểm tra', 
            desc: 'Tạo đề thi trắc nghiệm thông minh với nhiều cấp độ khó.', 
            icon: <FileText className="text-emerald-500" />,
            color: 'bg-emerald-50',
            hoverColor: 'hover:border-emerald-200'
          },
          { 
            id: 'tutor', 
            title: 'Trợ lý học tập', 
            desc: 'Giải đáp thắc mắc và phân tích hình ảnh bài tập.', 
            icon: <MessageSquare className="text-purple-500" />,
            color: 'bg-purple-50',
            hoverColor: 'hover:border-purple-200'
          }
        ].map((item, index) => (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -8, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setCurrentView(item.id as View)}
            className={cn(
              "flex flex-col items-start p-10 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm text-left transition-all hover:shadow-xl group cursor-pointer",
              item.hoverColor
            )}
          >
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-transform group-hover:rotate-6", item.color)}>
              {React.cloneElement(item.icon as React.ReactElement<any>, { size: 32 })}
            </div>
            <h3 className="text-3xl font-bold mb-4 text-slate-900">{item.title}</h3>
            <p className="text-slate-500 text-lg mb-8 leading-relaxed">{item.desc}</p>
            <div className="mt-auto flex items-center text-slate-400 text-sm font-bold group-hover:text-slate-900 transition-colors uppercase tracking-widest">
              Bắt đầu ngay <ChevronRight size={18} className="ml-2" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-slate-600" />
          </button>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Luyện tập & Kiểm tra</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Chế độ thi chuẩn</span>
            </div>
          </div>
        </div>
        
        {generatedQuiz && (
          <div className="flex items-center gap-2">
            <button onClick={downloadPDF} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 text-sm font-bold">
              <Download size={16} /> PDF
            </button>
            <button onClick={downloadDOC} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 text-sm font-bold">
              <Download size={16} /> DOCX
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-[#F8F9FB]">
        {!generatedQuiz ? (
          <div className="max-w-4xl mx-auto py-12 px-4">
            <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-xl space-y-12">
              <div className="text-center">
                <h2 className="text-4xl font-display font-bold text-slate-900 mb-3">Thiết lập đề thi</h2>
                <p className="text-slate-500 text-lg">Chọn các mục dưới đây để AI tạo đề thi phù hợp nhất cho bạn.</p>
              </div>

              {error && (
                <div className="p-6 bg-red-50 border border-red-100 rounded-3xl text-red-600 font-medium flex items-center gap-3">
                  <X className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-12">
                {/* Step 1: Type */}
                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">1. Loại hình học tập</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { id: 'Kiểm tra kiến thức', label: 'Kiểm tra nhanh', desc: 'Thử thách nhanh, củng cố kiến thức tức thì', icon: <BookOpen />, color: 'emerald' },
                      { id: 'Đề thi', label: 'Đề thi chuẩn', desc: 'Đề thi chính thức, sát thực tế BGD&ĐT', icon: <GraduationCap />, color: 'blue' }
                    ].map(t => (
                      <motion.button
                        key={t.id}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setQuizType(t.id)}
                        className={cn(
                          "flex items-center gap-5 p-6 rounded-3xl border-2 transition-all text-left group cursor-pointer",
                          quizType === t.id 
                            ? t.color === 'emerald' ? "bg-emerald-50 border-emerald-500 shadow-lg shadow-emerald-100" : "bg-blue-50 border-blue-500 shadow-lg shadow-blue-100"
                            : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
                        )}
                      >
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                          quizType === t.id 
                            ? t.color === 'emerald' ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
                            : "bg-slate-50 text-slate-400 group-hover:bg-slate-100"
                        )}>
                          {React.cloneElement(t.icon as React.ReactElement<any>, { size: 28 })}
                        </div>
                        <div>
                          <div className={cn("font-bold text-lg", quizType === t.id ? (t.color === 'emerald' ? "text-emerald-900" : "text-blue-900") : "text-slate-700")}>{t.label}</div>
                          <div className="text-sm text-slate-400">{t.desc}</div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Subject */}
                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">2. Môn học</label>
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                    {subjects.map(s => (
                      <motion.button
                        key={s}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setQuizSubject(s)}
                        className={cn(
                          "py-4 rounded-2xl border-2 font-bold transition-all text-sm cursor-pointer shadow-sm",
                          quizSubject === s 
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-emerald-200" 
                            : "bg-white border-slate-100 text-slate-600 hover:border-emerald-200"
                        )}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Grade */}
                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">3. Khối lớp</label>
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(g => (
                      <motion.button
                        key={g}
                        whileHover={{ scale: 1.1, y: -2 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setQuizGrade(String(g))}
                        className={cn(
                          "py-3 rounded-xl border-2 font-bold transition-all text-sm cursor-pointer shadow-sm",
                          quizGrade === String(g) 
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-emerald-100" 
                            : "bg-white border-slate-100 text-slate-600 hover:border-emerald-200"
                        )}
                      >
                        {g}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Step 4: Period (if Exam) */}
                {quizType === 'Đề thi' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">4. Kỳ thi</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {['Giữa kì 1', 'Cuối kì 1', 'Giữa kì 2', 'Cuối kì 2'].map(p => (
                        <motion.button
                          key={p}
                          whileHover={{ scale: 1.05, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setQuizExamPeriod(p)}
                          className={cn(
                            "py-4 px-2 rounded-2xl border-2 font-bold transition-all text-xs text-center cursor-pointer shadow-sm",
                            quizExamPeriod === p 
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-emerald-100" 
                              : "bg-white border-slate-100 text-slate-600 hover:border-emerald-200"
                          )}
                        >
                          {p}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Step 5: Optional Details / Quick Check Config */}
                {quizType === 'Kiểm tra kiến thức' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-50">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Chủ đề cụ thể</label>
                      <input 
                        type="text" 
                        placeholder="VD: Hàm số bậc hai, Hóa hữu cơ..."
                        className="w-full px-6 py-5 rounded-3xl border-2 border-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-slate-50 text-lg"
                        value={quizTopic}
                        onChange={(e) => setQuizTopic(e.target.value)}
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Số câu & Thời gian</label>
                      <div className="flex gap-3">
                        <select 
                          value={quizQuestionCount}
                          onChange={(e) => setQuizQuestionCount(Number(e.target.value))}
                          className="flex-1 px-4 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-700"
                        >
                          {[5, 10, 15, 20, 25, 30, 40, 50].map(c => (
                            <option key={c} value={c}>{c} câu</option>
                          ))}
                        </select>
                        <select 
                          value={quizTimeLimit}
                          onChange={(e) => setQuizTimeLimit(Number(e.target.value))}
                          className="flex-1 px-4 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-700"
                        >
                          {[15, 30, 45, 90].map(t => (
                            <option key={t} value={t}>{t} phút</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-3">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1 text-center block">Mức độ thử thách</label>
                      <div className="flex bg-slate-100 p-1.5 rounded-[2rem] max-w-2xl mx-auto w-full">
                        {['Dễ', 'Trung bình', 'Khó', 'Chuyên gia'].map(d => (
                          <motion.button
                            key={d}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setQuizDifficulty(d)}
                            className={cn(
                              "flex-1 py-3 rounded-[1.5rem] text-sm font-bold transition-all cursor-pointer",
                              quizDifficulty === d 
                                ? "bg-white text-emerald-600 shadow-sm" 
                                : "text-slate-500 hover:text-slate-700"
                            )}
                          >
                            {d}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleGenerateQuiz}
                  disabled={loading}
                  className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-bold hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-4 shadow-xl shadow-emerald-100 text-xl mt-12 cursor-pointer"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Plus size={28} />}
                  Bắt đầu tạo đề ngay
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto py-8 px-4">
            <motion.div 
              ref={quizResultRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {quizSubmitted && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-6"
                >
                  <div className="md:col-span-1 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center relative">
                      <Trophy size={48} className="text-emerald-500" />
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-black px-3 py-1.5 rounded-full shadow-lg"
                      >
                        SCORE
                      </motion.div>
                    </div>
                    <div>
                      <div className="text-6xl font-black text-slate-900 tracking-tighter">
                        {quizScore.toFixed(1)}
                      </div>
                      <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Thang điểm 10</div>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${quizScore * 10}%` }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-indigo-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                      <MessageSquare size={120} />
                    </div>
                    <div className="relative z-10 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                          <AlertCircle size={20} />
                        </div>
                        <h3 className="text-xl font-bold">Nhận xét từ EduAI</h3>
                      </div>
                      
                      {feedbackLoading ? (
                        <div className="flex items-center gap-3 py-4">
                          <Loader2 className="animate-spin" />
                          <span className="font-medium opacity-80">AI đang phân tích kết quả của bạn...</span>
                        </div>
                      ) : (
                        <div className="markdown-body markdown-light text-indigo-50 leading-relaxed max-h-[200px] overflow-y-auto pr-4 custom-scrollbar">
                          <Markdown>{quizFeedback || "Đang tải nhận xét..."}</Markdown>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
              <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-100">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900">{generatedQuiz.title}</h2>
                    <div className="flex items-center gap-4 mt-2">
                      <p className="text-slate-400 font-medium">Thời gian còn lại:</p>
                      <div className={cn(
                        "px-4 py-1.5 rounded-xl font-mono font-bold text-lg",
                        timeLeft < 60 ? "bg-red-50 text-red-600 animate-pulse" : "bg-slate-100 text-slate-700"
                      )}>
                        {formatTime(timeLeft)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-bold border border-emerald-100">
                      {quizSubmitted ? 'Đã hoàn thành' : 'Đang thực hiện'}
                    </div>
                    {quizSubmitted && (
                      <button 
                        onClick={() => {
                          setGeneratedQuiz(null);
                          setIsTimerRunning(false);
                        }}
                        className="text-sm text-slate-400 hover:text-emerald-600 font-bold flex items-center gap-1"
                      >
                        <ArrowLeft size={14} /> Làm đề khác
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-16">
                  {generatedQuiz.questions.map((q, i) => (
                    <div key={i} className="space-y-6">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex gap-5">
                          <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
                            {i + 1}
                          </span>
                          <div className="space-y-2">
                            <div className="text-xl font-medium text-slate-800 leading-relaxed">
                              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {q.question}
                              </Markdown>
                            </div>
                            <div className="flex gap-2">
                              <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full uppercase tracking-widest">
                                {q.type === 'multiple-choice' ? 'Trắc nghiệm' : q.type === 'true-false' ? 'Đúng/Sai' : q.type === 'short-answer' ? 'Trả lời ngắn' : 'Tự luận'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleGetHelp(i, 'hint')}
                            className="p-2.5 text-amber-500 hover:bg-amber-50 rounded-xl transition-colors"
                            title="Gợi ý"
                          >
                            <Lightbulb size={20} />
                          </button>
                        </div>
                      </div>

                      {/* AI Help Display */}
                      <AnimatePresence>
                        {activeHelp?.index === i && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="ml-14 overflow-hidden"
                          >
                            <div className="p-5 bg-amber-50 border border-amber-100 rounded-2xl text-[15px] relative">
                              <button 
                                onClick={() => setActiveHelp(null)}
                                className="absolute top-3 right-3 text-amber-400 hover:text-amber-600"
                              >
                                <X size={16} />
                              </button>
                              <p className="font-bold text-amber-800 mb-3 flex items-center gap-2">
                                {activeHelp.type === 'hint' && <Lightbulb size={16} />}
                                {activeHelp.type === 'method' && <HelpCircle size={16} />}
                                {activeHelp.type === 'solution' && <BookOpen size={16} />}
                                Hỗ trợ AI: {activeHelp.type === 'hint' ? 'Gợi ý' : activeHelp.type === 'method' ? 'Phương pháp' : 'Lời giải'}
                              </p>
                              <div className="markdown-body text-amber-900 leading-relaxed">
                                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {activeHelp.content}
                                </Markdown>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {helpLoading === i && (
                        <div className="ml-14 flex items-center gap-3 text-sm text-slate-400 font-medium">
                          <Loader2 size={16} className="animate-spin text-emerald-500" /> AI đang soạn lời giải...
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 pl-14">
                        {q.type === 'multiple-choice' || q.type === 'true-false' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {q.options?.map((opt, j) => {
                              const isSelected = userAnswers[i] === j;
                              const isCorrect = String(q.correctAnswer) === String(j);
                              const showResult = quizSubmitted;
                              
                              return (
                                <button
                                  key={j}
                                  disabled={quizSubmitted}
                                  onClick={() => {
                                    const newAnswers = [...userAnswers];
                                    newAnswers[i] = j;
                                    setUserAnswers(newAnswers);
                                  }}
                                  className={cn(
                                    "text-left p-5 rounded-2xl border-2 transition-all flex items-center justify-between group",
                                    !showResult && isSelected ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-white border-slate-100 hover:border-emerald-200",
                                    showResult && isCorrect && "bg-emerald-50 border-emerald-500 text-emerald-700",
                                    showResult && isSelected && !isCorrect && "bg-red-50 border-red-500 text-red-700"
                                  )}
                                >
                                  <div className="flex items-center gap-4">
                                    <span className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors",
                                      isSelected ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-500"
                                    )}>
                                      {String.fromCharCode(65 + j)}
                                    </span>
                                    <div className="flex-1">
                                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                        {opt}
                                      </Markdown>
                                    </div>
                                  </div>
                                  {showResult && isCorrect && <CheckCircle2 size={20} />}
                                </button>
                              );
                            })}
                          </div>
                        ) : q.type === 'short-answer' ? (
                          <div className="space-y-3">
                            <input 
                              type="text"
                              disabled={quizSubmitted}
                              placeholder="Nhập câu trả lời ngắn của bạn..."
                              className="w-full p-5 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none transition-all bg-slate-50 focus:bg-white text-lg"
                              value={userAnswers[i] || ''}
                              onChange={(e) => {
                                const newAnswers = [...userAnswers];
                                newAnswers[i] = e.target.value;
                                setUserAnswers(newAnswers);
                              }}
                            />
                            {quizSubmitted && (
                              <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl text-sm font-bold border border-emerald-100">
                                Đáp án đúng: {q.correctAnswer}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <textarea 
                              disabled={quizSubmitted}
                              placeholder="Trình bày bài làm tự luận chi tiết tại đây..."
                              className="w-full p-6 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none transition-all bg-slate-50 focus:bg-white min-h-[200px] text-lg leading-relaxed"
                              value={userAnswers[i] || ''}
                              onChange={(e) => {
                                const newAnswers = [...userAnswers];
                                newAnswers[i] = e.target.value;
                                setUserAnswers(newAnswers);
                              }}
                            />
                          </div>
                        )}
                      </div>
                      {quizSubmitted && (
                        <div className="ml-14 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-[15px] text-slate-600 leading-relaxed">
                          <p className="font-bold mb-3 text-slate-900 flex items-center gap-2">
                            <BookOpen size={18} className="text-emerald-500" /> Hướng dẫn giải chi tiết:
                          </p>
                          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {q.explanation}
                          </Markdown>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-16 pt-10 border-t border-slate-100">
                  {!quizSubmitted ? (
                    <button 
                      onClick={handleQuizSubmit}
                      className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-emerald-100 text-xl cursor-pointer"
                    >
                      Hoàn thành & Nộp bài
                    </button>
                  ) : (
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setGeneratedQuiz(null)}
                        className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all text-xl cursor-pointer"
                      >
                        Làm đề mới
                      </button>
                      <button 
                        onClick={() => setCurrentView('dashboard')}
                        className="flex-1 py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all text-xl cursor-pointer"
                      >
                        Về trang chủ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );

  const renderTutor = () => (
    <div className="fixed inset-0 z-[60] bg-[#F0F2F5] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white/80 backdrop-blur-lg sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setCurrentView('dashboard')}
            className="p-2.5 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          >
            <ArrowLeft size={24} className="text-slate-600" />
          </motion.button>
          <div>
            <h3 className="font-bold text-slate-900 text-xl tracking-tight">Trợ lý học tập thông minh</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">AI Powered • Online</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-2xl font-bold text-xs border border-purple-100">
            <Search size={14} /> AI Powered
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 space-y-8 bg-gradient-to-b from-[#F8F9FB] to-[#F0F2F5]"
      >
        {chatHistory.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center text-center space-y-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-purple-400 blur-3xl opacity-20 animate-pulse" />
              <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-[2.5rem] flex items-center justify-center rotate-12 shadow-2xl relative z-10">
                <MessageSquare size={64} className="text-white -rotate-12" />
              </div>
            </div>
            <div className="space-y-3 max-w-md">
              <h2 className="text-4xl font-bold text-slate-900 tracking-tight">EduAI có thể giúp gì?</h2>
              <p className="text-slate-500 text-lg leading-relaxed">
                Chụp ảnh bài tập hoặc nhập câu hỏi. AI sẽ tự động nhận diện môn học và đưa ra lời giải chi tiết.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl px-4">
              {[
                { text: 'Giải toán hình học lớp 12', icon: '📐' },
                { text: 'Viết đoạn văn nghị luận xã hội', icon: '✍️' },
                { text: 'Dịch và giải thích ngữ pháp Anh', icon: '🇬🇧' },
                { text: 'Cân bằng phương trình hóa học', icon: '🧪' }
              ].map((hint, idx) => (
                <motion.button 
                  key={hint.text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setTutorQuery(hint.text)}
                  className="p-5 bg-white border border-slate-100 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-purple-300 hover:text-purple-600 transition-all text-left shadow-sm hover:shadow-md flex items-center gap-3 cursor-pointer"
                >
                  <span className="text-xl">{hint.icon}</span>
                  {hint.text}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {chatHistory.map((msg, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}
          >
            <div className={cn(
              "max-w-[90%] md:max-w-[80%] p-6 rounded-[2rem] shadow-sm relative group",
              msg.role === 'user' 
                ? "bg-gradient-to-br from-purple-600 to-indigo-700 text-white rounded-tr-none shadow-purple-200" 
                : "bg-white text-slate-800 rounded-tl-none border border-slate-100 shadow-slate-200"
            )}>
              <div className="markdown-body text-[16px] leading-relaxed">
                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {msg.content}
                </Markdown>
              </div>
              <div className={cn(
                "absolute bottom-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase tracking-widest",
                msg.role === 'user' ? "right-4 text-purple-200" : "left-4 text-slate-300"
              )}>
                {msg.role === 'user' ? 'Bạn' : 'EduAI Assistant'}
              </div>
            </div>
          </motion.div>
        ))}

        {loading && chatHistory[chatHistory.length - 1]?.role === 'user' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-white border border-slate-100 p-6 rounded-[2rem] rounded-tl-none flex items-center gap-4 shadow-sm">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI đang suy nghĩ...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-slate-200 pb-10 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="max-w-4xl mx-auto">
          <AnimatePresence>
            {tutorImage && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="mb-4 relative inline-block"
              >
                <img src={tutorImage} alt="Preview" className="h-24 w-24 object-cover rounded-2xl border-2 border-purple-100 shadow-lg" />
                <button 
                  onClick={() => setTutorImage(null)}
                  className="absolute -top-3 -right-3 bg-slate-900 text-white rounded-full p-1.5 shadow-xl hover:scale-110 transition-transform cursor-pointer"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className="relative flex items-center gap-3 bg-[#F3F4F6] rounded-[2.5rem] p-3 pl-6 border-2 border-transparent focus-within:border-purple-200 focus-within:bg-white transition-all shadow-inner">
            <label className="p-3 text-slate-400 hover:text-purple-600 transition-colors cursor-pointer hover:scale-110 active:scale-95">
              <Plus size={28} />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            
            <textarea 
              placeholder="Hỏi EduAI bất cứ điều gì..."
              className="flex-1 bg-transparent py-3 px-2 focus:outline-none text-slate-800 resize-none max-h-40 min-h-[48px] text-lg font-medium"
              rows={1}
              value={tutorQuery}
              onChange={(e) => {
                setTutorQuery(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTutorQuery();
                }
              }}
            />
            
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleTutorQuery}
              disabled={loading || (!tutorQuery && !tutorImage)}
              className={cn(
                "p-4 rounded-full transition-all shadow-lg flex items-center justify-center cursor-pointer",
                loading || (!tutorQuery && !tutorImage) 
                  ? "bg-slate-200 text-slate-400" 
                  : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-200"
              )}
            >
              {loading ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {!process.env.GEMINI_API_KEY && (
        <div className="bg-amber-50 border-b border-amber-200 p-2 text-center text-xs font-bold text-amber-800">
          ⚠️ Thiếu GEMINI_API_KEY. Hãy thiết lập biến môi trường trên Vercel để ứng dụng hoạt động.
        </div>
      )}
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 cursor-pointer" 
              onClick={() => setCurrentView('dashboard')}
            >
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                <GraduationCap size={24} />
              </div>
              <span className="text-xl font-display font-bold text-slate-900">EduAI</span>
            </motion.div>
            
            <div className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={cn(
                  "text-sm font-medium transition-colors",
                  currentView === 'dashboard' ? "text-emerald-600" : "text-slate-600 hover:text-emerald-500"
                )}
              >
                Trang chủ
              </button>
              <button 
                onClick={() => {
                  setCurrentView('history');
                  fetchHistory();
                }}
                className={cn(
                  "text-sm font-medium transition-colors",
                  currentView === 'history' ? "text-emerald-600" : "text-slate-600 hover:text-emerald-500"
                )}
              >
                Lịch sử
              </button>
              <button 
                onClick={() => setCurrentView('tutor')}
                className={cn(
                  "text-sm font-medium transition-colors",
                  currentView === 'tutor' ? "text-emerald-600" : "text-slate-600 hover:text-emerald-500"
                )}
              >
                Gia sư AI
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors cursor-pointer">
                <Search size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {currentView === 'dashboard' && renderDashboard()}
            {currentView === 'quiz' && renderQuiz()}
            {currentView === 'tutor' && renderTutor()}
            {currentView === 'history' && renderHistory()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );

  function renderHistory() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Lịch sử luyện tập</h1>
            <p className="text-slate-500 mt-1">Xem lại các bài thi và kết quả của bạn</p>
          </div>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex items-center gap-2 text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer"
          >
            <ArrowLeft size={20} />
            Quay lại
          </button>
        </div>

        {historyLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="animate-spin text-emerald-500 mb-4" size={40} />
            <p className="text-slate-500">Đang tải lịch sử...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mx-auto mb-4">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Chưa có lịch sử</h3>
            <p className="text-slate-500 mt-2">Hãy bắt đầu luyện tập để theo dõi tiến độ của bạn.</p>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="mt-6 bg-emerald-500 text-white px-6 py-2 rounded-xl font-medium hover:bg-emerald-600 transition-colors cursor-pointer"
            >
              Luyện tập ngay
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {history.map((item) => (
              <motion.div
                key={item.id}
                whileHover={{ y: -2 }}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                    <Trophy size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                      {item.quizzes?.title || "Bài thi không tên"}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {new Date(item.created_at).toLocaleDateString('vi-VN')} • {new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-600">{item.score}/10</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Điểm số</p>
                  </div>
                  <button 
                    onClick={() => {
                      setGeneratedQuiz(item.quizzes.content);
                      setUserAnswers(item.user_answers);
                      setQuizSubmitted(true);
                      setQuizScore(item.score);
                      setQuizFeedback(item.feedback);
                      setCurrentView('quiz');
                    }}
                    className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition-colors cursor-pointer"
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
